/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 s0i4x and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Heading } from "@components/Heading";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { gitRemote } from "@shared/vencordUserAgent";
import {
    ModalCloseButton as RawModalCloseButton,
    ModalContent as RawModalContent,
    ModalFooter as RawModalFooter,
    ModalHeader as RawModalHeader,
    ModalRoot as RawModalRoot,
    ModalSize
} from "@utils/modal";
import { relaunch } from "@utils/native";
import { RenderModalProps } from "@vencord/discord-types";
import { openModal, ScrollerThin } from "@webpack/common";

// These are exported as `never` by @utils/modal; cast to usable component types
// (same pattern as the MessageCleaner modal this is styled after).
const ModalRoot = RawModalRoot as (props: any) => any;
const ModalHeader = RawModalHeader as (props: any) => any;
const ModalContent = RawModalContent as (props: any) => any;
const ModalFooter = RawModalFooter as (props: any) => any;
const ModalCloseButton = RawModalCloseButton as (props: any) => any;

export interface UpdateChange {
    hash: string;
    author: string;
    message: string;
}

let isOpen = false;

export function openUpdateModal(changes: UpdateChange[]) {
    if (isOpen) return;
    isOpen = true;
    openModal(props => <UpdateModal changes={changes} modalProps={props} />);
}

const hashChipStyle: React.CSSProperties = {
    fontFamily: "var(--font-code, monospace)",
    fontSize: 12,
    background: "var(--background-modifier-accent)",
    padding: "2px 7px",
    borderRadius: 5,
    flexShrink: 0,
    whiteSpace: "nowrap"
};

function UpdateModal({ changes, modalProps }: { changes: UpdateChange[]; modalProps: RenderModalProps; }) {
    const close = () => { isOpen = false; modalProps.onClose(); };
    const repoUrl = gitRemote ? `https://github.com/${gitRemote}` : null;
    const count = changes.length;

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader separator={false}>
                <Heading tag="h2" style={{ flex: 1, margin: 0 }}>Xmrcord atualizado</Heading>
                <ModalCloseButton onClick={close} />
            </ModalHeader>

            <ModalContent>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 16 }}>
                    <Card variant="success">
                        <Paragraph>
                            O Xmrcord foi atualizado com <strong>{count}</strong>{" "}
                            {count === 1 ? "mudança" : "mudanças"}. Reinicie o Discord para aplicar.
                        </Paragraph>
                    </Card>

                    <Heading tag="h5">O que mudou</Heading>
                    <Paragraph style={{ opacity: 0.7 }}>
                        Commits aplicados nesta atualização{repoUrl ? ", clique no hash para abrir no GitHub." : "."}
                    </Paragraph>

                    <ScrollerThin fade style={{ maxHeight: 280 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {changes.map(c => (
                                <div key={c.hash} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                                    {repoUrl
                                        ? <Link href={`${repoUrl}/commit/${c.hash}`} style={hashChipStyle}>{c.hash}</Link>
                                        : <span style={hashChipStyle}>{c.hash}</span>
                                    }
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <Paragraph style={{ margin: 0 }}>{c.message}</Paragraph>
                                        <Paragraph style={{ margin: 0, opacity: 0.6, fontSize: 12 }}>por {c.author}</Paragraph>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollerThin>
                </div>
            </ModalContent>

            <ModalFooter>
                <Button variant="primary" onClick={relaunch}>Reiniciar agora</Button>
                <Button variant="secondary" onClick={close}>Depois</Button>
            </ModalFooter>
        </ModalRoot>
    );
}
