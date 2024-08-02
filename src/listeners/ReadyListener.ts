import ms from 'enhanced-ms'
import { App, ButtonBuilder, EmbedBuilder, Listener, Logger } from '../structures'
import { Guild, User } from '../database'
import locales from '../locales'
import { ActionRowComponents, TextChannel } from 'eris'
import { CommandStructure } from '../../types'
import MainController from '../scraper'

export default class ReadyListener extends Listener {
  constructor(client: App) {
    super({
      client,
      name: 'ready'
    })
  }
  async on() {
    Logger.send(`${this.client.user.username}#${this.client.user.discriminator} online!`)

    const commands: CommandStructure[] = []
    this.client.commands.forEach(command => {
      commands.push({
        name: command.name,
        name_localizations: command.name_localizations,
        description: command.description,
        description_localizations: command.description_localizations,
        options: command.options,
        type: 1
      })
    })
    this.client.bulkEditCommands(commands)
    const deleteGuild = async() => {
      const guilds = await Guild.find()
      for(const guild of guilds) {
        if(!this.client.guilds.get(guild.id)) {
          await guild.deleteOne()
        }
      }
    }
    const sendResults = async() => {
      const res = await MainController.getResults()
      console.log(res)
      if(!res) return
      const guilds = await Guild.find({
        events: {
          $exists: true
        }
      })
      let matches: any[] = []
      for(const guild of guilds) {
        let data = res.filter(d => guild.events.some((e: any) => e.name === d.tournament.name))
        if(!data || !data[0]) return
        if(guild.lastResult && guild.lastResult !== data[0].id) {
          let match = data.find(e => e.id == guild.lastResult)
          let index = data.indexOf(match!)
          if(index > -1) {
            data = data.slice(0, index)
            matches = data
          }
          else {
            data = data.slice(0, 1)
            matches = data
          }
          data.reverse()
          for(const e of guild.events) {
            for(const d of data) {
              if(e.name === d.tournament) {
                const embed = new EmbedBuilder()
                .setTitle(d.tournament.name)
                .setThumbnail(d.tournament.image)
                .addField(`:flag_${d.teams[0].country}: ${d.teams[0].name}\n:flag_${d.teams[1].country}: ${d.teams[1].name}`, '', true)
                .addField(`${d.teams[0].score}\n${d.teams[1].score}`, '', true)
                .setFooter(d.stage)
                this.client.createMessage(e.channel2, {
                  embed,
                  components: [
                    {
                      type: 1,
                      components: [
                        new ButtonBuilder()
                        .setLabel(locales(guild.lang, 'helper.stats'))
                        .setStyle('link')
                        .setURL(`https://vlr.gg/${d.id}`)
                      ] as ActionRowComponents[]
                    }
                  ]
                })
              }
            }
          }
          data.reverse()
        }
        guild.lastResult = data[0].id
        guild.save()
      }
      const users = await User.find({
        guesses: {
          $exists: true
        }
      })
      if(!matches.length) return
      for(const user of users) {
        for(const match of matches) {
          let guess = user.history.find((h: any) => h.match === match.id)
          if(!guess) continue
          if(guess.teams[0].score === match.teams[0].score && guess.teams[1].score === match.teams[1].score) {
            user.guessesRight += 1
          }
          else {
            user.guessesWrong += 1
          }
        }
        user.save()
      }
    }
    const sendMatches = async() => {
      const res = await MainController.getMatches()
      if(!res) return
      const guilds = await Guild.find({
        events: {
          $exists: true
        }
      })
      const res2 = await MainController.getResults()
      if(!guilds.length) return
      for(const guild of guilds) {
        if(guild.verificationTime > Date.now()) continue
        const results = res2.filter(d => d.id === guild.matches.at(-1))
        if(!results.length && guild.matches.length) {
          guild.verificationTime = new Date().setHours(24, 0, 0, 0)
          await guild.save()
          continue
        }
        guild.matches = []
        let data = res.filter(d => guild.events.some((e: any) => e.name === d.tournament))
        for(const e of guild.events) {
          if(!this.client.getChannel(e.channel1)) continue
          let messages = await this.client.getMessages(e.channel1)
          await this.client.deleteMessages(e.channel1, messages.map(m => m.id))
          for(const d of data) {
            if(Number(ms(d.when)) > 86400000) continue
            if(e.name === d.tournament) {
              let index = guild.matches.findIndex((m: string) => m === d.id)
              if(index > -1) guild.matches.splice(index, 1)
              guild.matches.push(d.id)
    
              const embed = new EmbedBuilder()
              .setTitle(d.tournament.name)
              .setDescription(`<t:${((Date.now() + Number(Number(ms(d.when)))) / 1000).toFixed(0)}:F> | <t:${((Date.now() + Number(Number(ms(d.when)))) / 1000).toFixed(0)}:R>`)
              .setThumbnail(d.tournament.image)
              .addField(`:flag_${d.teams[0].country}: ${d.teams[0].name}\n:flag_${d.teams[1].country}: ${d.teams[1].name}`, '', true)
              .setFooter(d.stage)
    
              const button = new ButtonBuilder()
              .setLabel(locales(guild.lang, 'helper.palpitate'))
              .setCustomId(`guess-${d.id}`)
              .setStyle('green')
    
              const urlButton = new ButtonBuilder()
              .setLabel(locales(guild.lang, 'helper.stats'))
              .setStyle('link')
              .setURL(`https://vlr.gg/${d.id}`)
              
              if(d.teams[0].name !== 'TBD' && d.teams[1].name !== 'TBD') this.client.createMessage(e.channel1, {
                embed,
                components: [
                  {
                    type: 1,
                    components: [button, urlButton] as ActionRowComponents[]
                  }
                ]
              })
              else {
                guild.tbdMatches.push({
                  id: d.id,
                  channel: e.channel1
                }) 
              }    
            }
          }
        }
        guild.verificationTime = new Date().setHours(24, 0, 0, 0)
        guild.save()
      }
    }
    const verifyIfMatchAlreadyHasTeams = async() => {
      const res = await MainController.getMatches()
      if(!res) return
      const guilds = await Guild.find()
      for(const guild of guilds) {
        if(!guild.tbdMatches.length) continue
        for(const match of guild.tbdMatches) {
          const data = res.find(d => d.id === match.id)
          if(!data) continue
          if(data.teams[0].name !== 'TBD' && data.teams[1].name !== 'TBD') {
            const channel = await this.client.getRESTChannel(match.channel) as TextChannel
            const embed = new EmbedBuilder()
            .setTitle(data.tournament.name)
            .setDescription(`<t:${((Date.now() + Number(ms(data.when))) / 1000).toFixed(0)}:F> | <t:${((Date.now() + Number(ms(data.when))) / 1000).toFixed(0)}:R>`)
            .setThumbnail(data.tournament.image)
            .addField(`:flag_${data.teams[0].country}: ${data.teams[0].name}\n:flag_${data.teams[1].country}: ${data.teams[1].name}`, '', true)
            .setFooter(data.stage)
            channel.createMessage({
              embed,
              components: [
                {
                  type: 1,
                  components: [
                    new ButtonBuilder()
                    .setLabel(locales(guild.lang, 'helper.palpitate'))
                    .setCustomId(`guess-${match.id}`)
                    .setStyle('green'),
                    new ButtonBuilder()
                    .setLabel(locales(guild.lang, 'helper.stats'))
                    .setStyle('link')
                    .setURL(`https://vlr.gg/${data.id}`)
                  ] as ActionRowComponents[]
                }
              ]
            })
            let index = guild.tbdMatches.findIndex((m: any) => m.id === match.id)
            guild.tbdMatches.splice(index, 1)
            guild.save()
          }
        }
      }
    }
    setInterval(async() => {
      await deleteGuild().catch(e => new Logger(this.client).error(e))
      await sendMatches().catch(e => new Logger(this.client).error(e))
      await sendResults().catch(e => new Logger(this.client).error(e))
      await verifyIfMatchAlreadyHasTeams().catch(e => new Logger(this.client).error(e))
    }, process.env.INTERVAL || 20000)
  }
}