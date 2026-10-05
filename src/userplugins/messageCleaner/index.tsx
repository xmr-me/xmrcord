/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 s0i4x and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import { DeleteIcon } from "@components/Icons";
import definePlugin from "@utils/types";
import { Channel } from "@vencord/discord-types";
import { ChannelType } from "@vencord/discord-types/enums";
import { findComponentByCodeLazy } from "@webpack";
import { Menu } from "@webpack/common";

import { cancelJob, getChannelTarget, getFriendsTarget } from "./cleaner";
import { openCleanerModal } from "./CleanerModal";

const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_BOTTOM,", 'position:"bottom"');

const TEXT_CHANNEL_TYPES = new Set<number>([
    ChannelType.GUILD_TEXT,
    ChannelType.DM,
    ChannelType.GUILD_VOICE,
    ChannelType.GROUP_DM,
    ChannelType.GUILD_ANNOUNCEMENT,
    ChannelType.ANNOUNCEMENT_THREAD,
    ChannelType.PUBLIC_THREAD,
    ChannelType.PRIVATE_THREAD,
    ChannelType.GUILD_STAGE_VOICE
]);

function makePatch(dmOnly: boolean): NavContextMenuPatchCallback {
    return (children, { channel }: { channel?: Channel; }) => {
        if (!channel) return;
        // The user menu also opens on members of a server, where `channel` is whatever chat is open.
        if (dmOnly ? channel.type !== ChannelType.DM : !TEXT_CHANNEL_TYPES.has(channel.type)) return;

        children.splice(-1, 0,
            <Menu.MenuGroup>
                <Menu.MenuItem
                    id="vc-cl-open"
                    label="Limpar minhas mensagens (CL)"
                    color="danger"
                    action={() => openCleanerModal(getChannelTarget(channel))}
                />
            </Menu.MenuGroup>
        );
    };
}

function FriendsCleanButton() {
    return (
        <HeaderBarIcon
            tooltip="Limpar minhas mensagens com todos os amigos (CL)"
            icon={() => <DeleteIcon width={20} height={20} />}
            onClick={() => openCleanerModal(getFriendsTarget())}
        />
    );
}

export default definePlugin({
    name: "MessageCleaner",
    description:
        "CL: clique com o botão direito em um chat, ou use o botão da página de amigos, para apagar as suas próprias mensagens. Analisa o histórico antes, pede confirmação, respeita o rate limit e pode ser cancelado.",
    authors: [{ name: "s0i4x", id: 0n }],
    tags: ["Chat", "Utility"],

    patches: [
        // Friends page header: put our button in the toolbar, before "New Group DM"
        {
            find: "#{intl::FRIENDS_SECTION_ONLINE}),className:",
            replacement: {
                match: /toolbar:(\(0,\i\.jsx\)\(\i,\{\}\)),(?=role:"navigation")/,
                replace: "toolbar:[$self.renderFriendsButton({}),$1],"
            }
        }
    ],

    contextMenus: {
        "channel-context": makePatch(false),
        "thread-context": makePatch(false),
        "gdm-context": makePatch(false),
        "user-context": makePatch(true)
    },

    renderFriendsButton: ErrorBoundary.wrap(FriendsCleanButton, { noop: true }),

    stop() {
        cancelJob();
    }
});
