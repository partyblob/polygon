import { ResponseSchema } from "llmagon"
import { SMTPClient, Message } from 'emailjs'
import { config, toolDefinitions, tools, onConfig, log } from '#polygon'

let client = null, clientFrom = ''
onConfig.push(() => {
	const email = config.tools?.email
	if(!email || typeof email != 'object'){ client = null; return }
	client = new SMTPClient({
		host: email.host,
		port: email.port ?? 465,
		ssl: email.ssl ?? true,
		user: email.user,
		password: email.password
	})
	clientFrom = email.from ?? (email.user.includes('@') ? email.user : '')
})
tools.sendEmail = ({ from, to, subject, text, html }) => {
	if(!client) return 'Email tool is not configured. Instruct user, if appropriate, to configure it via config.tools.email'
	const msg = new Message()
	msg.header.from = from ?? clientFrom
	msg.header.to = to
	msg.header.subject = subject
	if(html) msg.alternative = html
	else msg.text = text
	if(!msg.header.from) return 'Email tool is not configured with a default sender. Instruct user, if appropriate, to configure it via config.tools.email.from, or pass a `from` parameter to this tool'

	return client.sendAsync(msg, msg.header.from, to.split(',').map(s => s.trim())).then(() => {
		const info = `Email sent to ${to} with subject "${subject}"`
		log.info(info)
		return info
	})
}

toolDefinitions.sendEmail = ResponseSchema('sendEmail', 'Send an email', {
	type: 'object',
	properties: {
		from: { type: ['string', 'null'], description: 'Sender email address (recommended null, auto)' },
		to: { type: 'string', description: 'Recipient email address(es), comma-separated' },
		subject: { type: 'string', description: 'Email subject' },
		text: { type: 'string', description: 'Plain text body' },
		html: { type: ['string', 'null'], description: 'HTML body (optional)' }
	},
	required: ['to', 'subject']
}, true)