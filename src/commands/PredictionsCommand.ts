import { App, Command, CommandContext, EmbedBuilder } from '../structures'

export default class PredictionsCommand extends Command {
  constructor(client: App) {
    super({
      client,
      name: 'predictions',
      nameLocalizations: {
        'pt-BR': 'palpites'
      },
      description: 'Shows your predictions',
      descriptionLocalizations: {
        'pt-BR': 'Mostra seus palpites'
      },
      options: [
        {
          type: 4,
          name: 'page',
          nameLocalizations: {
            'pt-BR': 'página'
          },
          description: 'Insert the page',
          descriptionLocalizations: {
            'pt-BR': 'Insira a página'
          }
        }
      ],
      botPermissions: ['EMBED_LINKS'],
      syntax: 'predictions <page>',
      examples: [
        'predictions',
        'predictions 1',
        'predictions 2',
        'predictions 5'
      ]
    })
  }
  async run(ctx: CommandContext) {
    if(!ctx.db.user?.history?.length) return ctx.reply('commands.history.no_predictions')
      let history = ctx.db.user.history.reverse()
      if(!Number(ctx.args[0]) || isNaN(Number(ctx.args[0])) || Number(ctx.args[0]) == 1) history = history.slice(0, 5)
      else history = history.slice(Number(ctx.args[0]) * 5 - 5, Number(ctx.args[0]) * 5)
  
      const embed = new EmbedBuilder()
      .setAuthor(this.locale('commands.history.embed.author'), ctx.callback.member?.avatarURL())
      .setDescription(this.locale('commands.history.embed.desc', {
        right: ctx.db.user.guessesRight,
        wrong: ctx.db.user.guessesWrong,
        t: ctx.db.user.history.length
      }))
      .setFooter(this.locale('commands.history.embed.footer', { 
        p1: isNaN(Number(ctx.args[0])) ? 1 : Number(ctx.args[0]),
        p2: Math.ceil(ctx.db.user.history.length / 5)
      }))
      for(const guess of history) {
        embed.addField(`${guess.teams[0].name} x ${guess.teams[1].name}`, this.locale('commands.history.embed.field', {
          score1: guess.teams[0].score,
          score2: guess.teams[1].score,
          link: `https://www.vlr.gg/${guess.match}`
        }))
      }
      ctx.reply(embed.build())
  }
}