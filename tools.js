import { ResponseSchema } from "llmagon"
import { exec } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { log } from './index.js'

const resolvePath = path => path[0] == '~' ? os.homedir() + path.slice(1) : path


const entities = {__proto__: null, amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", copy: 
'©'}
const scrape = ({url}) => {
	if(/file:/iy.test(url)) return '[[File URLs disabled]]'
	if(!/\w+:\/\//y.test(url)) url = 'https://' + url
	log.info(`Scraping ${new URL(url).hostname}...`)
	return fetch(url).then(a => {
		if(/\s*application\s*\/\s*json/yi.test(a.headers.get('content-type')??'')) return a.json()
		if(!/\s*text\s*\/\s*html/yi.test(a.headers.get('content-type')??'')) return a.text()
		return a.text().then(a => {
			return a.replace(/<a(?:"[^"]*"['"]*|'[^']*'['"]*|(?!href)[^'">])*href=(['"])((?:[^'"]|(?!\1)['"])*)\1(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])*>/g,'[Link: $2]').replace(/(?:<!DOCTYPE[^>]>|\s*<!\-\-(?:[^\-]|\-(?!\->))*\-\->\s*|\s*<(script|head|template|style|noscript|iframe|canvas|nav|footer|header|sidebar|svg)[^]*?<\s*\/\s*\1\s*>\s*|\s*<(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])+>\s*)+/gi, ' ').replace(/&#\d{1,10};|&#x[0-9a-fA-F]{1,8};|&\w{1,20};/g, a => a[1] == '#' ? String.fromCodePoint(a[2] == 'x' ? parseInt(a.slice(3,-1), 16) : +a.slice(2,-1)) : entities[a.slice(1,-1)] ?? '\ufffd')
		})
	}).catch(e => '[[Scrape failed]]')
}

export const toolDefinitions = {
	__proto__: null,
	scrape: ResponseSchema('fetch', 'This tool scrapes a web page or API', {
		type: 'object',
		properties: { url: { type: 'string' } },
		required: ['url']
	}, true),
	exec: ResponseSchema('exec', 'This tool executes a shell command', {
		type: 'object',
		properties: { command: { type: 'string' }, timeout: { type: 'number', default: 30 }, cwd: { type: 'string', default: '.' } },
		required: ['command']
	}, true),
	edit: ResponseSchema('edit', 'This tool edits/creates files line-wise', {
		type: 'object',
		requiredProperties: {
			filename: { type: 'string' },
			atomic: { type: 'boolean', default: false },
			create: { type: 'boolean', default: false },
			edits: {
				type: 'array',
				description: 'Order as found in file; appends come last. Pass an actual array, not a string containing a JSON array',
				items: {
					type: 'object',
					requiredProperties: {
						type: { type: 'string', enum: ['insert_after', 'insert_before', 'replace', 'delete', 'append'] },
						find: { type: 'string', exceptFor: 'append' },
						new: { type: 'string', exceptFor: 'delete' },
						byLine: { type: 'boolean', default: true, description: '`find` must match the entire line' },
					}
				}
			}
		}
	}, true)
}

const execTool = ({command, timeout = 30, cwd = '.'}) => new Promise((res, rej) => {
	log.info(`Executing in ${cwd} command: ${command}`)
	exec(command, { timeout: Math.max(1000, timeout*1000), windowsHide: true, cwd: path.resolve(defCwd, resolvePath(cwd)) }, (e, stdout, stderr) => {
		res((e ? '[Exit code: '+e.code+']\n' : '') + (stderr + '\n' + stdout).trim())
	})
})
let defCwd = process.cwd()
export const configure = opts => {
	if(typeof opts.cwd == 'string') defCwd = resolvePath(opts.cwd)
}

const edit = async ({filename, edits, atomic = false, create = false}) => {
	const res = []
	if(typeof edits == 'string')
		try{ edits = JSON.parse(edits); res.push('Warning: `edits` was passed as a string containing JSON. This is deprecated, pass an actual array instead') }
		catch(_){ return ['Edits must be a valid JSON array of edit objects'] }
	log.info(`Editing ${filename} (${edits.length} edits${create?', +create':''})`)
	const data2 = []
	filename = path.resolve(defCwd, resolvePath(filename))
	let data = await fs.readFile(filename).catch(e=>null)
	if(data === null){
		if(!create) return ['File does not exist or cannot be read, and create flag was not set']
		data = ''
	}else data = data.toString()
	if(edits.length == 1 && edits[0].type === 'replace' && data.startsWith(edits[0].find) && /\r?\n$/y.test(data.slice(edits[0].find.length))){
		res.push(`Whole file replaced -${edits[0].find} +${edits[0].new.length}`)
		res.push(`Warning: consider replacing only individual lines, when appropriate`)
		data = edits[0].new + data.slice(edits[0].find.length)
	}else top: for(let {type, byLine = true, find, new: n} of edits){
		if(typeof type !== 'string'){ return ['Edits must be a valid JSON array of edit objects'] }
		byLine = +!!byLine
		if(type == 'append'){
			data2.push(data)
			if(byLine && data.length && data.charCodeAt(data.length - 1) != 10) data2.push('\n')
			data2.push(n); data = ''
			continue
		}
		let i = 0, i2 = -1
		while(true){
			let next = data.indexOf(find, i)
			if(next < 0) break
			if(byLine){
				const p = data[next-1] ?? '\n', n = data[next+find.length] ?? '\n'
				if(p != '\n' || (n != '\n' && n != '\r')){ i = next+1; continue }
			}
			if(i2 == -1) i2 = next
			else{
				res.push('Fail: Multiple matches found')
				continue top
			}
			i = next+find.length
		}
		if(i2 == -1){
			res.push('Fail: No match found')
			continue
		}
		if(type == 'replace') data2.push(data.slice(0, i2) + n), res.push(`Replace: -${find.length} +${n.length}`)
		else if(type == 'delete') data2.push(data.slice(0, i2 - byLine)), res.push(`Delete: -${find.length+byLine}`)
		else if(type == 'insert_before') data2.push(data.slice(0, i2) + n + (byLine?'\n':'') + find), res.push(`Insert: +${n.length+byLine}`)
		else if(type == 'insert_after') data2.push(data.slice(0, i2 + find.length) + (byLine?'\n':'') + n), res.push(`Insert: +${n.length+byLine}`)
		else{
			res.push('Fail: Invalid edit type')
			continue
		}
		data = data.slice(i2 + find.length)
	}
	if(data) data2.push(data)
	if(atomic){
		const failed = res.filter(r => r.startsWith('Fail:'))
		if(failed.length){
			failed.push('Atomic flag was set: no changes were made')
			return failed
		}
	}
	try{
		await fs.writeFile(filename, data2.join(''))
	}catch(e){ return ['Failed to write to file: '+(e?.message??e?.code??e)] }
	return res
}

export const tools = { __proto__: null, fetch: scrape, exec: execTool, edit }
