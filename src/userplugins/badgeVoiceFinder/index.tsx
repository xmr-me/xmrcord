/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 s0i4x and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { Popout, React, useRef, useState } from "@webpack/common";

import { BadgeVoicePanel } from "./VoicePanel";

const PanelButton = findComponentByCodeLazy(".GREEN,positionKeyStemOverride:");

function BadgeIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 2.18l7 3.12V11c0 4.52-3.02 8.79-7 10.03C8.02 19.79 5 15.52 5 11V6.3l7-3.12zm-1 4.82v2h2V8h-2zm0 4v4h2v-4h-2z"/>
        </svg>
    );
}

function BadgeFinderButton(props: { nameplate?: any; }) {
    const [show, setShow] = useState(false);
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    return (
        <Popout
            position="top"
            align="left"
            targetElementRef={buttonRef}
            shouldShow={show}
            onRequestClose={() => setShow(false)}
            renderPopout={() => <BadgeVoicePanel />}
        >
            {() => (
                <PanelButton
                    ref={buttonRef}
                    tooltipText="Badge Voice Finder"
                    icon={BadgeIcon}
                    plated={props?.nameplate != null}
                    onClick={() => setShow(s => !s)}
                />
            )}
        </Popout>
    );
}

export default definePlugin({
    name: "BadgeVoiceFinder",
    description: "Botão ao lado do mic: filtra quem está em call por badge (Early Supporter, Bug Hunter, etc.) no servidor escolhido.",
    authors: [{ name: "s0i4x", id: 0n }],
    tags: ["Voice", "Utility"],

    patches: [
        {
            find: "#{intl::USER_PROFILE_ACCOUNT_POPOUT_BUTTON_A11Y_LABEL}",
            replacement: {
                match: /children:\[(?=.{0,25}?accountContainerRef)/,
                replace: "children:[$self.BadgeFinderButton(arguments[0]),"
            }
        }
    ],

    BadgeFinderButton: ErrorBoundary.wrap(BadgeFinderButton, { noop: true })
});
