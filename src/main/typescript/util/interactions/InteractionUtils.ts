import {
    ChatInputCommandInteraction,
    GuildMember, MessageComponentInteraction,
    PermissionsString,
    TextChannel
} from 'discord.js';
import {BoarBotApp} from '../../BoarBotApp';
import {BotConfig} from '../../bot/config/BotConfig';
import {DataHandlers} from '../data/DataHandlers';
import {Replies} from './Replies';
import {LogDebug} from '../logging/LogDebug';
import {GuildData} from '../data/global/GuildData';
import moment from 'moment';
import {Queue} from './Queue';

/**
 * {@link InteractionUtils InteractionUtils.ts}
 *
 * Functions needed by many interactions.
 *
 * @license {@link http://www.apache.org/licenses/ Apache-2.0}
 * @copyright WeslayCodes 2023
 */
export class InteractionUtils {
    /**
     * Handles the beginning of most command interactions to prevent duplicate code
     *
     * @param config - Used to get the string to reply with
     * @param interaction - Interaction to reply to
     * @return guildData - Guild data parsed from JSON
     */
    public static async handleStart(
        interaction: ChatInputCommandInteraction,
        config: BotConfig
    ): Promise<GuildData | undefined> {
        if (!interaction.guild || !interaction.channel) return;

        const guildData: GuildData | undefined = await DataHandlers.getGuildData(interaction.guild.id, interaction);
        if (!guildData) return;

        if (!guildData.fullySetup) {
            await Replies.currentConfigReply(interaction, config);
            return;
        }

        const acceptableChannels: string[] = [...guildData.channels];

        if (!acceptableChannels.includes(interaction.channel.id)) {
            await Replies.wrongChannelReply(interaction, guildData, config);
            return;
        }

        return guildData;
    }

    /**
     * Handles response to a user running an interaction while banned
     *
     * @param interaction - Interaction to reply to
     * @param config - Used to get the string to reply with
     * @param forceFollowup - Whether the reply should be a follow up
     * @return banned - Whether user is banned
     */
    public static async handleBanned(
        interaction: ChatInputCommandInteraction | MessageComponentInteraction, config: BotConfig, forceFollowup = false
    ): Promise<boolean> {
        const bannedUserData: Record<string, number> =
            DataHandlers.getGlobalData(DataHandlers.GlobalFile.BannedUsers) as Record<string, number>;
        const unbanTime: number | undefined = bannedUserData[interaction.user.id];

        if (unbanTime && unbanTime > Date.now()) {
            await Replies.handleReply(
                interaction, config.stringConfig.bannedString.replace('%@', moment(unbanTime).fromNow()),
                config.colorConfig.error, undefined, undefined, forceFollowup
            );

            return true;
        } else if (unbanTime && unbanTime <= Date.now()) {
            await Queue.addQueue(async () => {
                try {
                    const bannedUserData: Record<string, number> = DataHandlers.getGlobalData(
                        DataHandlers.GlobalFile.BannedUsers
                    ) as Record<string, number>;
                    delete bannedUserData[interaction.user.id];
                    DataHandlers.saveGlobalData(bannedUserData, DataHandlers.GlobalFile.BannedUsers);
                } catch (err: unknown) {
                    await LogDebug.handleError(err, interaction);
                }
            }, interaction.id + 'global');
        }

        return false;
    }

    /**
     * Gets a text channel from ID
     *
     * @param channelID - ID of channel
     */
    public static async getTextChannel(channelID: string): Promise<TextChannel | undefined> {
        let channel: TextChannel;

        try {
            channel = await BoarBotApp.getBot().getClient().channels.fetch(channelID) as TextChannel;
        } catch {
            LogDebug.handleError(
                'Bot cannot find the channel.\nIs the channel ID \'' + channelID +
                '\' correct? Does the bot have view channel permissions?', undefined, false
            );
            return;
        }

        const memberMe: GuildMember | null = channel.guild.members.me;
        if (!memberMe) {
            LogDebug.handleError('Bot doesn\'t exist in the server the channel is in.');
            return;
        }

        const memberMePerms: PermissionsString[] = memberMe.permissions.toArray();
        if (!memberMePerms.includes('SendMessages')) {
            LogDebug.handleError('Bot doesn\'t have permission to send messages to channel.', undefined, false);
            return;
        }

        return channel;
    }
}