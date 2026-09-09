import fs from 'fs'
import { AIConfig, ResponseSchema, Message } from 'llmagon'
import rl from 'readline'
import { parse } from 'jsonc-parser'

export const fatalError = err => {
	console.error('\x1b[31m%s\x1b[m', err)
	process.exit(1)
}

if(!process.argv[2]) fatalError('Usage: npx polygon path/to/.config.json')

	export let config = null

export const onShutdown = [], onConfig = []

export const log = {
	info: (message, ...a) => config.verbose && (typeof message == 'string' ?
		console.log(`\x1b[2K\r\x1b[35m[VERBOSE]\x1b[m ${message}`, ...a)
		: console.log(`\x1b[35m[VERBOSE]\x1b[m %o`, message, ...a), rlInt?.prompt()),
	error: e => {
		console.error(typeof e == 'string' ? `\x1b[2K\r\x1b[31m%s\x1b[m` : '\x1b[2K\r\x1b[31m%o\x1b[m', e)
		rlInt?.prompt()
	},
	success: (message, ...a) => (typeof message == 'string' ?
		console.log(`\x1b[2K\r\x1b[32m${message}\x1b[m`, ...a)
		: console.log(`\x1b[2K\r\x1b[32m%o\x1b[m`, message, ...a)
	, rlInt?.prompt())
}
process.on('unhandledRejection', log.error)
process.on('uncaughtError', log.error)

export const loadConfig = () => {
	const newConfig = parse(fs.readFileSync(process.argv[2]).toString())
	if(typeof newConfig !== 'object' || !newConfig) throw new Error('Invalid config file')
	config = newConfig
	for(const fn of onConfig) try{ fn() }catch(e){ log.error(e) }
}

fs.watch(process.argv[2], { persistent: false }, () => {
	log.info('Config file changed, reloading...')
	try{
		loadConfig()
		log.success('Config reloaded successfully')
	}catch(e){
		log.error('Failed to reload config: ' + e)
	}
})

try{ loadConfig() }catch(e){
	fatalError('Failed to load config: '+e)
}

let rlInt = null
if(config.repl){
	const tmp = {}
	let $_
	rlInt = rl.createInterface({ input: process.stdin, output: process.stdout })
	rlInt.setPrompt('\x1b[34m> \x1b[m')
	rlInt.on('line', __line__ => {
		rlInt.prompt()
		try{
			$_ = eval(__line__)
			if(typeof $_?.then == 'function'){
				$_.then(
					v => { console.log('\x1b[2K\r\x1b[90m<\x1b[m %o', v); rlInt.prompt() },
					e => { console.log('\x1b[2K\r\x1b[31m%o\x1b[m', e); rlInt.prompt() }
				)
			}else console.log('\x1b[2K\r\x1b[90m<\x1b[m %o', $_)
		}catch(e){ console.log('\x1b[2K\r\x1b[31m%o\x1b[m', e) }
		rlInt.prompt()
	}).on('close', () => {
		rlInt = null
		Promise.allSettled(onShutdown).then(() => { process.exit(0) })
	}).prompt()
}

export const toolDefinitions = Object.create(null)
export const tools = Object.create(null)
export const models = new Map()