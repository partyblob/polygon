import { config, fatalError, log, tools, models } from '#polygon'
import { Client, GatewayIntentBits, Partials, ChannelType } from 'discord.js'
import { Message } from 'llmagon'

const bot = new Client({
  intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
})

const defaultModelId = config.discord.default_model ?? 'default'
const defaultModel = models.get(config.discord.default_model ?? 'default')
if(!defaultModel) fatalError(`Discord default_model '${config.discord.default_model}' not found`)

const channels = new Map()
class Channel extends Array{
	queued = []
	constructor(id){
		const m = models.get(id)
		super(m?.systemPrompt ?? null)
		this.modelId = id
		this.model = m
	}
	lastUsed = 0; modelId = ''; model = null
}
Object.setPrototypeOf(config.discord.models, null)
setInterval(() => {
	const cutoff = Date.now() - 900e3
	for(const {0: id, 1: ch} of channels){
		if(ch.lastUsed < cutoff) channels.delete(id)
	}
}, 300e3)
bot.on('messageCreate', async (message) => {
	if(message.author.bot) return
	let ch = channels.get(message.channel.id)
	if(!ch){
		const modelId = config.discord.models[message.channel.id]
		if(typeof modelId !== 'string') return
		channels.set(message.channel.id, ch = new Channel(modelId))
	}
	const msg = Message.User(message.content, message.author.tag)
	if(ch.lastUsed === Infinity){
		// Already busy. Queue message for next turn
		ch.queued.push(msg)
		return
	}
	let lastSend = Date.now()
	let err = e => {
		log.info(e)
		if(!err) return; err = null
		clearInterval(int)
		ch.lastUsed = Date.now()
		message.channel.send('Error:\n```\n' + (e?.stack??e?.message??e) + '\n```')
	}
	ch.push(msg)
	message.channel.sendTyping().catch(err)
	const int = setInterval(() => {
		message.channel.sendTyping().catch(err)
	}, 9000)
	let MAX_CONTEXT = (config.discord.history ?? 20) >>> 0
	let rateLimitDebounce = 1500
	ch.lastUsed = Infinity
	while(true) try{
		let str = '', curType = '', freshLine = true
		let mdPrefix = ''
		const flush = v => {
			if(!(v = v.trim())) return
			if(curType == 'reasoning'){
				if(ch.model.showReasoning) v = v.replace(/^|[\r\n]+/g, '$&-# ')
				else return
			}
			const arr = v.match(/```(\w+(?=\n|$))?/g)
			if(!mdPrefix){
				if(arr && (arr.length&1)){
					v += '\n```' // unclosed code block, try to fix it
					mdPrefix = arr[arr.length-1] + '\n'
				}
			}else{
				v = mdPrefix + v
				if(arr){
					if(!(arr.length&1)){
						v += '\n```'
						mdPrefix = arr[arr.length-1] + '\n'
					}else mdPrefix = ''
				}else v += '\n```'
			}
			message.channel.send(v).catch(err)
		}
		if(!ch.model) throw new TypeError("No model named '"+ch.modelId+"'")
		const response = await ch.model.stream(ch, (type, chunk) => {
			if(type != curType){
				flush(str)
				str = ''; curType = type
			}
			str += chunk
			do{
				let i = str.lastIndexOf('\n\n')
				let r = ''
				if(i > 1900 || (i < 0 && str.length > 1900)){
					let j = 1
					i = str.lastIndexOf('\n', 1900)
					if(i < 0) i = str.lastIndexOf('.', 1900)
					if(i < 0) i = str.lastIndexOf(' ', 1900)
					if(i < 0) i = 1900, j = 0
					r = str.slice(0, i); str = str.slice(i+j)
				}else if(i >= 0 && lastSend + 1000 < Date.now()){
					r = str.slice(0, i); str = str.slice(i+2)
				}else return
				lastSend = Date.now()
				flush(r)
			}while(str.length > 1900)
		}).done
		rateLimitDebounce = 1500
		flush(str)
		ch.push(Message.Assistant(response.content))
		if(response.tools){
			const tres = []
			for(const tool of response.tools){
				if(tool.name == 'switch_model'){
					const m = models.get(tool.param.model)
					if(!m){
						ch.push(Message.Tool(JSON.stringify(`Model switch requested but model '${tool.param.model}' not found`), tool))
					}else{
						ch.model = m; ch.modelId = tool.param.model
						ch.systemPrompt = m.systemPrompt
						message.react('🔄').catch(()=>{})
						// model switch is transparent to the LLM itself
					}
					continue
				}
				try{ tres.push(tool, tools[tool.name]?.(tool.param, message) ?? 'Unknown tool or error executing tool') }
				catch(e){ log.error(e); tres.push(tool, 'Unknown tool or error executing tool') }
			}
			for(let i = 0; i < tres.length; i += 2){
				try{ ch.push(Message.Tool(JSON.stringify(await tres[i+1]), tres[i])) }
				catch(e){ log.error(e); ch.push(Message.Tool(JSON.stringify('Unknown tool or error executing tool'), tres[i])) }
			}
			if(ch.queued.length){
				for(const u of ch.queued) ch.push(u)
				ch.queued.length = 0
			}
		}
		if(ch.length > MAX_CONTEXT) ch.splice(0, ch.length - MAX_CONTEXT)
		if(response.stopReason == 'stop') break
	}catch(e){ if(e?.code === 429){ log.info("Ratelimit when invoking model '%s'", ch.modelId); await new Promise(r => setTimeout(r, rateLimitDebounce)); rateLimitDebounce *= 2 }else return void err?.(e) }
	err = null
	clearInterval(int)
	ch.lastUsed = Date.now()
})

log.info('Starting discord client')
await bot.login(config.discord.token)
log.success(`Discord bot logged in as ${bot.user.tag}`)
if(config.discord.presence) bot.user.setPresence(config.discord.presence)