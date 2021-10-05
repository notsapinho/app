import { getChannel } from '../store/channels';
import { getGuild, getGuildRoles } from '../store/guilds';
import { getMember, getSelfMember } from '../store/members';
import { getRoles } from '../store/roles';

// FIXME: import this namespace from types
export namespace PermissionTypes {
  export enum General {
    VIEW_CHANNELS = 1024,
    // MANAGE_NICKNAMES = 512, // change number
    // CHANGE_NICKNAME = 256, // change number
    MANAGE_INVITES = 256,
    CREATE_INVITE = 128,
    KICK_MEMBERS = 64,
    // BAN_MEMBERS = 32, // change number
    MANAGE_CHANNELS = 16,
    MANAGE_ROLES = 8,
    MANAGE_GUILD = 4,
    // VIEW_AUDIT_LOG = 2, // change number
    ADMINISTRATOR = 1,
  }
  export enum Text {
    // ADD_REACTIONS = 2048 * 16,
    // MENTION_EVERYONE = 2048 * 8,
    READ_MESSAGES = 2048 * 4,
    MANAGE_MESSAGES = 2048 * 2,
    SEND_MESSAGES = 2048,
  }
  export enum Voice {
    // MOVE_MEMBERS = 32768 * 8,
    // MUTE_MEMBERS = 32768 * 4,
    SPEAK = 32768 * 2,
    CONNECT = 32768,
  }
  export const All = {
    ...General,
    ...Text,
    ...Voice,
  }
  export type Permission = General | Text | Voice;
  export type PermissionString = keyof typeof All;
  
  export const defaultPermissions =
    PermissionTypes.General.VIEW_CHANNELS
    | PermissionTypes.General.CREATE_INVITE
    | PermissionTypes.Text.SEND_MESSAGES
    | PermissionTypes.Text.READ_MESSAGES;
}

export class PermService {
  public readonly description = {
    general: {
      'ADMINISTRATOR': `Gives all permissions. This is a dangerous permission.`,
      'CREATE_INVITE': 'Ability to create invites for users to join this guild.',
      'KICK_MEMBERS': 'Ability to kick members from this guild.',
      'MANAGE_CHANNELS': 'Ability to create, edit, or delete channels.',
      'MANAGE_GUILD': `Ability to edit general guild settings.`,
      'MANAGE_ROLES': 'Ability to create, update, and delete guild roles.',
      'VIEW_CHANNELS': 'Ability to view channels.',
      'MANAGE_INVITES': 'Ability to delete invites.',
    },
    text: {
      'MANAGE_MESSAGES': `Ability to manage message other member's messages.`,
      'READ_MESSAGES': `Ability to read messages,`,
      'SEND_MESSAGES': 'Ability to send messages in text channels.',
    },
  };

  constructor(private state: Store.AppState) {}

  public canMember(permission: PermissionTypes.PermissionString, guild: Entity.Guild, member: Entity.GuildMember) {
    return guild.ownerId === member.userId
      || this.hasPerm(
          this.getTotalPerms(member, guild.id),
          PermissionTypes.All[permission] as number,
        );
  }
  public canInChannel(permission: PermissionTypes.PermissionString, guildId: string, channelId: string) {
    const channel = this.getChannel(channelId);    
    const member = this.getSelfMember(guildId);

    const overrides = channel.overrides
      ?.filter(o => member.roleIds.includes(o.roleId)) ?? [];

    const cumulativeAllowPerms = overrides.reduce((prev, curr) => prev | curr.allow, 0);
    const cumulativeDenyPerms = overrides.reduce((prev, curr) => prev | curr.deny, 0);

    const permNumber = PermissionTypes.Text[permission];
    const canInherently = this.can(permission, guildId);
    const isAllowedByOverride = this.hasPerm(cumulativeAllowPerms, permNumber);
    const isDeniedByOverride = this.hasPerm(cumulativeDenyPerms, permNumber);

    return (canInherently && !isDeniedByOverride) || isAllowedByOverride;
  }

  public can(permission: PermissionTypes.PermissionString, guildId: string) {
    const guild = this.getGuild(guildId);    
    const member = this.getSelfMember(guildId);

    return guild.ownerId === member.userId
      || this.hasPerm(
          this.getTotalPerms(member, guildId),
          PermissionTypes.All[permission] as number,
        );
  }
  private getTotalPerms(member: Entity.GuildMember, guildId: string) {
    return getGuildRoles(guildId)(this.state)
      .filter(r => member?.roleIds.includes(r.id))
      .reduce((acc, value) => value.permissions | acc, 0);
  }
  private hasPerm(totalPerms: number, permission: number) {
    return Boolean(totalPerms & permission)
        || Boolean(totalPerms & PermissionTypes.General.ADMINISTRATOR);
  }

  public canManage(prereq: PermissionTypes.PermissionString, guildId: string, managedUserId: string) {
    const userMember = getMember(guildId, managedUserId)(this.state);
    if (!userMember) return false;

    return this.can(prereq, guildId)
      && (this.state.auth.user!.id === userMember.userId
      || (this.memberIsHigher(guildId, userMember.roleIds)));
  }

  public canPunish(prereq: PermissionTypes.PermissionString, guildId: string, managedUserId: string) {
    return this.state.auth.user!.id !== managedUserId
      && this.can(prereq, guildId)
      && this.canManage(prereq, guildId, managedUserId);
  }

  // TODO: test
  public memberIsHigher(guildId: string, roleIds: string[]) {
    const guild = this.getGuild(guildId);
    const member = this.getSelfMember(guildId);    
    const myRoles = getRoles(member.roleIds)(this.state);
    const theirRoles = getRoles(roleIds)(this.state);

    const max = (key: string) => (max, val) => (max[key] > val[key]) ? max : val;
    const myHighestRole: Entity.Role = myRoles.reduce(max('position'));
    const theirHighestRole: Entity.Role = theirRoles.reduce(max('position'));

    const selfIsOwner = member.userId === guild.ownerId;
    const selfHasHigherRole = myHighestRole.position >= theirHighestRole.position;    

    return selfIsOwner || selfHasHigherRole;
  }

  private getChannel(channelId: string) {
    const channel = getChannel(channelId)(this.state);
    if (!channel)
      throw new TypeError('Channel not found');
    return channel;
  }
  private getGuild(guildId: string) {
    const guild = getGuild(guildId)(this.state);
    if (!guild)
      throw new TypeError('Guild not found');
    return guild;
  } 
  private getSelfMember(guildId: string) {
    const member = getSelfMember(guildId)(this.state);
    if (!member)
      throw new TypeError('Member not found');
    return member;
  }
}