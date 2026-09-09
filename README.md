# polygon - Even more AI slop!

Integrate your favorite slopenator into discord and have it do stuff for you.

Make a `polygon.config.json`. Example:
```jsonc
{
	"verbose": true,
	"repl": true,
	"discord": {
		"token": "MTEx...",
		"presence": { "status": "online" },
		"history": 20,
		"models": {
			// Allow-list by channel ID
			"123456789123456789": "default"
		}
	},
	"tools": {
		"cwd": "~/workspace",
		"email": {
			"host": "my.mail.server",
			// "port": 465, "ssl": true,
			"user": "be-kind-to-my-clanker@my.mail.server",
			"password": "dQw4w...",
			"from": "My secretary <be-kind-to-my-clanker@my.mail.server>"
		}
	},
	"models": {
		"common": {
			// Only completions-style endpoints are currently supported
			"endpoint": "https://openrouter.ai/api/v1/chat/completions",
			"token": "sk-...",
			// Allow the model to switch to a different model. You can give instructions for when to switch to each model
			"upgrades": {
				"roleplay": "Non-serious interactions like joking around, roleplaying, etc.",
				"default": "Default model for general use and problem solving"
			},
			"maxTokens": 8192, // Max response length. This does not control context window
			"tools": ["scrape"],
			"show_reasoning": false // Don't send reasoning tokens to the user
		},
		"default": {
			"include": "common",
			"model": "qwen/qwen3.6-35b-a3b",
			"tools": ["exec", "edit", "email"] // Tools to execute shell commands or edit files on the host machine
		},
		"roleplay": {
			"include": "common",
			"system_prompt": "Roleplay mode.\nYour name is Marv. Marv is really rude and likes to give sarcastic responses. Despite this, you are often silly and blissfully unaware, you tend to use 'XD' and 'lmao' and similar language. If the last message is short, so should yours be",
			"model": "deepseek/deepseek-v3.2",
			"maxTokens": 1024,
			"tools": ["!scrape"], // Disable a specific tool
			"temperature": 1.5
		},
	}
}
```

Run it
```bash
node . path/to/polygon.config.json
```

> **WARNING**: Potentially destructive tools such as `exec` (bash commands) and `edit` (file editing) are not permission-gated beyond what is in your config file. Make sure to not expose models with access to such tools (or other models which can upgrade to such models) to any channel IDs you do not trust.

> **WARNING 2**: Your config file contains API keys. Try to keep it out of reach of the AI itself, especially when it's using `exec`. Also consider making a dedicated folder for the LLM to start in like `~/.polygon/workspace` to encourage it to not touch other stuff (you can set it in config `tools.cwd`).