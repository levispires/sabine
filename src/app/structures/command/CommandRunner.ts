import { CommandInteraction, Message, TextChannel } from 'eris'
import { Guild, User } from '../../../database'
import locale from '../../../locales'
import EmbedBuilder from '../builders/EmbedBuilder.js'
import App from '../client/App'
import Logger from '../util/Logger.js'
import CommandContext from './CommandContext.js'
import { CommandInteractionDataOptions } from '../../../../types'

interface CommandRunnerOptions {
  client: App
  callback: CommandInteraction
  locale: string
}
export default class CommandRunner {
  client: App
  callback: CommandInteraction
  locale: string
  constructor(options: CommandRunnerOptions) {
    this.client = options.client
    this.callback = options.callback
    this.locale = options.locale
  }
  async run() {
    if(this.callback instanceof CommandInteraction) {
      const guild = await Guild.findById(this.callback.guildID)
      const user = await User.findById(this.callback.member?.id)
      const db = {
        user,
        guild
      }
      const ctx: CommandContext = new CommandContext(
        {
          client: this.client,
          db,
          guild: this.client.guilds.get(this.callback.guildID!)!,
          callback: this.callback,
          locale: this.locale
        }
      )
      let cmd = this.client.commands.get(this.callback.data.name)
      if(!cmd) return
      const { permissions } = await import(`../../../locales/${this.locale}.js`)
      if(cmd.permissions) {
        let perms: string[] = []
        for(let perm of cmd.permissions) {
          if(!ctx.callback.member?.permissions.has(perm as any)) perms.push(perm)
        }
        if(perms[0]) return ctx.reply('helper.permissions.user', {
          permissions: perms.map(p => `\`${permissions[p]}\``).join(', ')
        })
      }
      if(cmd.botPermissions) {
        let perms = []
        let member = this.client.guilds.get(guild?.id)?.members.get(this.client.user.id)
        for(let perm of cmd.botPermissions) {
          if(!member?.permissions.has(perm as any)) perms.push(perm)
        }
        if(perms[0]) return ctx.reply('helper.permissions.bot', {
          permissions: perms.map(p => `\`${permissions[p]}\``).join(', ')
        })
      }
      if(cmd.ephemeral) {
        await this.callback.defer(64)
      }
      else await this.callback.defer()

      cmd.locale = (content: string, args: any) => {
        return locale(this.locale, content, args)
      }
      cmd.getUser = async(user: string) => {
        try {
          if(isNaN(Number(user))) return await this.client.getRESTUser(user.replace(/[<@!>]/g, ''))
          else return await this.client.getRESTUser(user as string)
        }
        catch(e) {
          new Logger(this.client).error(e as Error)
        }
      }
      if(this.callback.data.options?.length && this.callback.data.options[0].type === 2) {
        ctx.args = (this.callback.data.options![0].options as CommandInteractionDataOptions[])[0].options?.map(o => o.value.toString()) ?? []
      }
      else if(this.callback.data.options?.length && this.callback.data.options[0].type === 1) {
        ctx.args = (this.callback.data as CommandInteractionDataOptions).options?.map(o => o.value?.toString()) ?? []
      }
      else {
        ctx.args = (this.callback.data as CommandInteractionDataOptions).options?.map(o => o.value?.toString()) ?? []
      }
      cmd.id = ctx.callback.data.id
      cmd.run(ctx)
      .catch((e: Error) => {
        new Logger(this.client).error(e)
        ctx.reply('helper.error', {
          e
        })
      })
      .then(async() => {
        const embed = new EmbedBuilder()
        .setAuthor(`${(ctx.callback as CommandInteraction).member?.username}`, (ctx.callback as CommandInteraction).member?.avatarURL)
        .setTitle('New slash command executed')
        .setDescription(`The command \`${cmd.name}\` has been executed in \`${ctx.guild.name}\``)
        .addField('Server ID', `\`${ctx.guild.id}\``)
        .addField('Owner ID', `\`${ctx.guild.ownerID}\``)
        .addField('Command author', `\`${(ctx.callback as CommandInteraction).member?.username}\``)
        .setThumbnail(ctx.guild.iconURL!)
  
        const channel = await this.client.getRESTChannel(process.env.COMMAND_LOG!) as TextChannel
        const webhooks = await channel.getWebhooks()
        let webhook = webhooks.find(w => w.name === `${this.client.user.username} Logger`)
        if(!webhook) webhook = await channel.createWebhook({ name: `${this.client.user.username} Logger` })
        
        this.client.executeWebhook(webhook.id, webhook.token!, {
          embed,
          avatarURL: this.client.user.avatarURL
        })
      })
    }
  }
}