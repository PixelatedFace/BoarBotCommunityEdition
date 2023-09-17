import fs from 'fs';
import {
	Client, ClientUser, ColorResolvable, EmbedBuilder,
	Events,
	GatewayIntentBits,
	Partials, TextChannel,
	User
} from 'discord.js';
import {Bot} from '../api/bot/Bot';
import {FormatStrings} from '../util/discord/FormatStrings';
import {ConfigHandler} from './handlers/ConfigHandler';
import {CommandHandler} from './handlers/CommandHandler';
import {EventHandler} from './handlers/EventHandler';
import {BotConfig} from './config/BotConfig';
import {Command} from '../api/commands/Command';
import {Subcommand} from '../api/commands/Subcommand';
import {LogDebug} from '../util/logging/LogDebug';
import {PowerupSpawner} from '../feat/PowerupSpawner';
import {Queue} from '../util/interactions/Queue';
import {DataHandlers} from '../util/data/DataHandlers';
import {CronJob} from 'cron';
import {BoarUser} from '../util/boar/BoarUser';
import axios from 'axios';
import {InteractionUtils} from '../util/interactions/InteractionUtils';
import * as crypto from 'crypto';
import {BoarUtils} from '../util/boar/BoarUtils';
import {ItemsData} from './data/global/ItemsData';
import {QuestData} from './data/global/QuestData';
import {PowerupData} from './data/global/PowerupData';
import {GitHubData} from './data/global/GitHubData';
import {GuildData} from './data/global/GuildData';

/**
 * {@link BoarBot BoarBot.ts}
 *
 * Creates a {@link Bot bot}, logs it in, then finds where
 * all event and command handlers are. Loads
 * other configurations as well.
 *
 * @license {@link http://www.apache.org/licenses/ Apache-2.0}
 * @copyright WeslayCodes 2023
 */
export class BoarBot implements Bot {
	private client: Client = new Client({ intents:[] });
	private configHandler: ConfigHandler = new ConfigHandler;
	private commandHandler: CommandHandler = new CommandHandler();
	private eventHandler: EventHandler = new EventHandler();
	private powSpawner: PowerupSpawner = {} as PowerupSpawner;

	/**
	 * Creates the bot by loading and registering global information
	 */
	public async create(): Promise<void> {
		this.buildClient();

		await this.loadConfig(true);
		this.registerCommands();
		this.registerListeners();
		this.fixGuildData();

		await this.login();
		await this.updateAllData();
		await this.onStart();
	}

	/**
	 * Builds the {@link Client} object with chosen options
	 */
	public buildClient(): void {
		this.client = new Client({
			partials: [
				Partials.Channel // For notifications
			],
			intents: [
				GatewayIntentBits.Guilds, // Enables bot to work in guilds
				GatewayIntentBits.DirectMessages // Allows users to toggle notifications off
			]
		});
	}

	/**
	 * Returns the client object associated with the bot
	 */
	public getClient(): Client {
		return this.client;
	}

	/**
	 * Finds config file and pulls it into the code
	 *
	 * @param firstLoad - Whether the config is being loaded for the first time
	 */
	public async loadConfig(
		firstLoad = false
	): Promise<void> {
		await this.configHandler.loadConfig(firstLoad);
	}

	/**
	 * Returns config information that was gathered from config file
	 */
	public getConfig(): BotConfig {
		return this.configHandler.getConfig();
	}

	/**
	 * Returns the SHA256 hash value of the config file
	 */
	public getConfigHash(): string {
		const configFile = fs.readFileSync('config.json');
		const hashSum = crypto.createHash('sha256');

		hashSum.update(configFile);

		return hashSum.digest('hex');
	}

	/**
	 * Registers command and subcommand information from files
	 */
	public registerCommands(): void {
		this.commandHandler.registerCommands();
	}

	/**
	 * Deploys both application and guild commands
	 */
	public async deployCommands(): Promise<void> {
		await this.commandHandler.deployCommands();
	}

	/**
	 * Returns command information like name, execute function, and more
	 */
	public getCommands(): Map<string, Command> {
		return this.commandHandler.getCommands();
	}

	/**
	 * Returns subcommand information like name and execute function
	 */
	public getSubcommands(): Map<string, Subcommand> {
		return this.commandHandler.getSubcommands();
	}

	/**
	 * Registers event listeners from files
	 */
	public registerListeners(): void {
		this.eventHandler.registerListeners();
	}

	/**
	 * Returns the powerup spawner object
	 */
	public getPowSpawner(): PowerupSpawner {
		return this.powSpawner;
	}

	/**
	 * Logs the bot in using token in env file
	 */
	public async login(): Promise<void> {
		try {
			LogDebug.log('Logging in...', this.getConfig());
			await this.client.login(process.env.TOKEN);
		} catch {
			await LogDebug.handleError('Client wasn\'t initialized or you used an invalid token!');
			process.exit(-1);
		}
	}

	/**
	 * Performs actions/functions needed on start
	 */
	public async onStart(): Promise<void> {
		try {
			LogDebug.log('Successfully logged in! Bot online!', this.getConfig());

			let lastHit = Date.now();
			this.client.rest.on('rateLimited', () => {
				const shouldSend = Date.now() > lastHit + 30000 &&
					this.client.users.cache.size >= fs.readdirSync(this.getConfig().pathConfig.userDataFolder).length;

				LogDebug.log(
					'Hit Limit! Cached Users: ' + this.client.users.cache.size + '/' +
					fs.readdirSync(this.getConfig().pathConfig.userDataFolder).length,
					this.getConfig(), undefined, shouldSend
				);

				lastHit = Date.now();
			});

			this.startNotificationCron();

			let configHash = this.getConfigHash();

			setInterval(async () => {
				if (configHash !== this.getConfigHash()) {
					configHash = this.getConfigHash();
					await this.loadConfig();
				}

				const config = this.getConfig();
				LogDebug.log('Interaction Listeners: ' + this.client.listenerCount(Events.InteractionCreate), config);
				await this.sendUpdateInfo(DataHandlers.getGithubData());

				const questData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Quest) as QuestData;

				if (questData.questsStartTimestamp + config.numberConfig.oneDay * 7 < Date.now()) {
					DataHandlers.updateQuestData(config);
				}
			}, 120000);

			// Powerup spawning

			let timeUntilPow = 0;

			await Queue.addQueue(async () => {
				try {
					const powerupData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Powerups) as PowerupData;
					timeUntilPow = powerupData.nextPowerup;
				} catch (err: unknown) {
					await LogDebug.handleError(err);
				}
			}, 'start' + 'global').catch((err) => { throw err });

			this.powSpawner = new PowerupSpawner(timeUntilPow);
			this.powSpawner.startSpawning();

			(this.client.user as ClientUser).setPresence({
				activities: [{
					name: "Info",
					state: "/boar help | boarbot.dev",
					type: 4
				}]
			});

			LogDebug.log('All functions online!', this.getConfig(), undefined, true);

			const userDataFolder = this.getConfig().pathConfig.databaseFolder +
				this.getConfig().pathConfig.userDataFolder;

			if (!fs.existsSync(userDataFolder)) {
				fs.mkdirSync(userDataFolder);
			}

			for (const userFile of fs.readdirSync(userDataFolder)) {
				try {
					this.getClient().users.fetch(userFile.split('.')[0]);
					await LogDebug.sleep(1000);
				} catch {
					LogDebug.handleError('Failed to find user ' + userFile.split('.')[0]);
				}
			}
		} catch (err: unknown) {
			await LogDebug.handleError(err);
		}
	}

	/**
	 * Starts CronJob that sends notifications for /boar daily
	 * @private
	 */
	private startNotificationCron(): void {
		new CronJob('0 0 * * *', async () => {
			fs.readdirSync(this.getConfig().pathConfig.userDataFolder).forEach(async userFile => {
				const user: User | undefined = this.getClient().users.cache.get(userFile.split('.')[0]);

				if (!user) return;

				const boarUser = new BoarUser(user);

				if (boarUser.stats.general.notificationsOn) {
					const msgStrs = this.getConfig().stringConfig.notificationExtras;
					const dailyReadyStr = this.getConfig().stringConfig.notificationDailyReady;
					const stopStr = this.getConfig().stringConfig.notificationStopStr;

					const randMsgIndex = Math.floor(Math.random() * msgStrs.length);
					let randMsgStr = msgStrs[randMsgIndex];

					if (randMsgStr !== '') {
						randMsgStr = '## ' + randMsgStr + '\n';
					}

					switch (randMsgIndex) {
						case 5:
							randMsgStr = randMsgStr.replace(
								'%@', Object.keys(this.getConfig().itemConfigs.boars).length.toLocaleString()
							);
							break;
						case 7:
							randMsgStr = randMsgStr.replace(
								'%@', fs.readdirSync(this.getConfig().pathConfig.userDataFolder).length.toLocaleString()
							);
							break;
						case 16:
							randMsgStr = randMsgStr.replace(
								'%@',
								fs.readdirSync(this.getConfig().pathConfig.guildDataFolder).length.toLocaleString()
							);
							break;
						case 17:
							randMsgStr = randMsgStr.replace('%@', boarUser.stats.general.boarStreak.toLocaleString());
							break;
					}

					const notificationChannelID = boarUser.stats.general.notificationChannel
						? boarUser.stats.general.notificationChannel
						: this.getConfig().defaultChannel;

					await user.send(
						randMsgStr + dailyReadyStr + '\n# ' +
						FormatStrings.toBasicChannel(notificationChannelID) + stopStr
					).catch(() => {});
				}
			});

			try {
				const pingChannel =
					await this.client.channels.fetch(this.getConfig().defaultChannel) as TextChannel;
				pingChannel.send(
					this.getConfig().stringConfig.notificationDailyReady + ' ' +
					this.getConfig().stringConfig.notificationServerPing
				);
			} catch (err) {
				LogDebug.handleError(err);
			}
		}, null, true, 'UTC');
	}

	/**
	 * Attempts to send GitHub update information to the updates channel
	 *
	 * @param githubData - The data including the last update PR URL
	 * @private
	 */
	private async sendUpdateInfo(
		githubData: GitHubData | undefined
	): Promise<void> {
		const config = this.getConfig();

		try {
			if (!githubData) return;

			const pullReq = await axios.get(config.stringConfig.pullLink, {
				headers: { Authorization: 'Token ' + process.env.GITHUB_TOKEN as string }
			});

			const pullReqData = pullReq.data[0];

			if (pullReqData && pullReqData.html_url !== githubData.lastURL && pullReqData.merged_at !== null) {
				githubData.lastURL = pullReqData.html_url;
				fs.writeFileSync(
					config.pathConfig.globalDataFolder + config.pathConfig.githubFileName,
					JSON.stringify(githubData)
				);

				const commitMsg = pullReqData.body;
				const commitName = pullReqData.title;
				const commitChannel = await InteractionUtils.getTextChannel(config.updatesChannel);
				const commitEmbed = new EmbedBuilder()
					.setColor(config.colorConfig.dark as ColorResolvable)
					.setTitle(commitName)
					.setURL(pullReqData.html_url)
					.setDescription(commitMsg.replace(commitName, '').substring(0, 500) + '...')
					.setThumbnail(config.stringConfig.githubImg);

				commitChannel?.send({ embeds: [commitEmbed] });
			}
		} catch (err: unknown) {
			LogDebug.handleError(err, undefined, false);
		}
	}

	/**
	 * Updates global data files to the state they should be in for the
	 * current version
	 *
	 * @private
	 */
	private async updateAllData(): Promise<void> {
		const itemsData = DataHandlers.getGlobalData(DataHandlers.GlobalFile.Items, true) as ItemsData;
		BoarUtils.orderGlobalBoars(itemsData, this.getConfig());
		DataHandlers.saveGlobalData(itemsData, DataHandlers.GlobalFile.Items);

		DataHandlers.getGlobalData(DataHandlers.GlobalFile.Leaderboards, true);
		DataHandlers.getGlobalData(DataHandlers.GlobalFile.BannedUsers, true);
		DataHandlers.getGlobalData(DataHandlers.GlobalFile.Powerups, true);
		DataHandlers.getGlobalData(DataHandlers.GlobalFile.Quest, true);
	}

	/**
	 * Deletes empty guild files (Guild was in the process of setting bot up)
	 *
	 * @private
	 */
	private fixGuildData(): void {
		const pathConfig = this.getConfig().pathConfig;
		const databaseFolder = pathConfig.databaseFolder;
		const guildDataFolder = databaseFolder + pathConfig.guildDataFolder;
		let guildDataFiles: string[];

		try {
			if (!fs.existsSync(databaseFolder)) {
				fs.mkdirSync(databaseFolder);
			}

			if (!fs.existsSync(guildDataFolder)) {
				fs.mkdirSync(guildDataFolder);
			}

			guildDataFiles = fs.readdirSync(guildDataFolder);
		} catch (err: unknown) {
			LogDebug.handleError(err);
			process.exit(-1);
		}

		for (const guildFile of guildDataFiles) {
			const guildData: GuildData = JSON.parse(fs.readFileSync(guildDataFolder + guildFile, 'utf-8')) as GuildData;
			if (guildData.fullySetup) continue;

			fs.rmSync(guildDataFolder + guildFile);

			LogDebug.log('Deleted unfinished guild file: ' + guildFile, this.getConfig());
		}

		LogDebug.log('Guild data fixed!', this.getConfig())
	}
}
