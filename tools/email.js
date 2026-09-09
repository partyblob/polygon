import { ResponseSchema } from "llmagon"
import { SMTPClient, Message } from 'emailjs'
import { config, toolDefinitions, tools, onConfig } from '#polygon'

let client = null
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
})
tools.sendEmail = async ({ from, to, subject, text, html }) => {
	if(!client) return 'Email tool is not configured. Instruct user, if appropriate, to configure it via config.tools.email'
	const msg = new Message()
	msg.header.from = from ?? cfg.from
	msg.header.to = to
	msg.header.subject = subject
	if(html) msg.alternative = html
	else msg.text = text

	const res = await client.sendAsync(await msg.readAsync(), msg.header.from, to.split(',').map(s => s.trim()))
	log.info(`Email sent to ${to} with subject "${subject}"`)
	log.verbose('Email server response:', res)
	return res
}

toolDefinitions.sendEmail = ResponseSchema('sendEmail', 'Send an email via SMTP (configured via config.tools.email)', {
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