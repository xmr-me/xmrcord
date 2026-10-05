/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 s0i4x and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import {
    ModalCloseButton as RawModalCloseButton,
    ModalContent as RawModalContent,
    ModalFooter as RawModalFooter,
    ModalHeader as RawModalHeader,
    ModalRoot as RawModalRoot,
    ModalSize
} from "@utils/modal";
import { Guild, RenderModalProps } from "@vencord/discord-types";
import { openModal, Select, TextInput, useState } from "@webpack/common";

import { getGuildConfig, setGuildConfig } from ".";
import { GuildFakeConfig, makeDefaultConfig } from "./types";

// These are exported as `never` by @utils/modal; cast to usable component types.
const ModalRoot = RawModalRoot as (props: any) => any;
const ModalHeader = RawModalHeader as (props: any) => any;
const ModalContent = RawModalContent as (props: any) => any;
const ModalFooter = RawModalFooter as (props: any) => any;
const ModalCloseButton = RawModalCloseButton as (props: any) => any;

export function openServerFakerModal(guild: Guild) {
    openModal(props => <ServerFakerModal guild={guild} modalProps={props} />);
}

const ONLINE_PERCENT_OPTIONS = [0, 10, 20, 30, 40, 50].map(p => ({
    label: p === 0 ? "Desligado (usar número fixo)" : `${p}%`,
    value: p
}));

function NumberField({ label, value, placeholder, onChange }: {
    label: string;
    value: string;
    placeholder?: string;
    onChange(value: string): void;
}) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Paragraph>{label}</Paragraph>
            <TextInput
                value={value}
                placeholder={placeholder ?? "deixar o valor real"}
                spellCheck={false}
                onChange={(v: string) => onChange(v.replace(/[^\d]/g, ""))}
            />
        </div>
    );
}

function ServerFakerModal({ guild, modalProps }: { guild: Guild; modalProps: RenderModalProps; }) {
    const [cfg, setCfg] = useState<GuildFakeConfig>(() => ({ ...makeDefaultConfig(), ...getGuildConfig(guild.id) }));

    function update(patch: Partial<GuildFakeConfig>) {
        const next = { ...cfg, ...patch };
        setCfg(next);
        // Persists and live-refreshes every UI that reads this guild.
        setGuildConfig(guild.id, next);
    }

    function reset() {
        setGuildConfig(guild.id, null);
        setCfg(makeDefaultConfig());
    }

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader separator={false}>
                <Heading tag="h2" style={{ flex: 1, margin: 0 }}>Fake: {guild.name}</Heading>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>

            <ModalContent>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 16 }}>
                    <Paragraph style={{ opacity: 0.7 }}>
                        Tudo aqui é só na sua visualização. Nada é enviado ao Discord e some quando você desliga o plugin ou reseta.
                    </Paragraph>

                    <Heading tag="h5">Contagem de membros</Heading>
                    <NumberField label="Membros (total)" value={cfg.memberCount} onChange={v => update({ memberCount: v })} />

                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <Paragraph>Online = % do total</Paragraph>
                        <Select
                            options={ONLINE_PERCENT_OPTIONS}
                            isSelected={(v: number) => v === cfg.onlinePercent}
                            select={(v: number) => update({ onlinePercent: v })}
                            serialize={(v: number) => String(v)}
                        />
                    </div>

                    {cfg.onlinePercent > 0
                        ? <Paragraph style={{ opacity: 0.7 }}>Online vai ser {cfg.onlinePercent}% do total exibido (atualiza junto).</Paragraph>
                        : <NumberField label="Online (número fixo)" value={cfg.onlineCount} onChange={v => update({ onlineCount: v })} />}

                    <Heading tag="h5">Selos</Heading>
                    <FormSwitch
                        title="Servidor verificado"
                        description="Mostra o selo de verificado ao lado do nome do servidor."
                        value={cfg.verified}
                        onChange={v => update({ verified: v })}
                    />
                    <FormSwitch
                        title="Servidor parceiro"
                        description="Mostra o selo de parceiro (Partner)."
                        value={cfg.partnered}
                        onChange={v => update({ partnered: v })}
                    />

                    <Heading tag="h5">Boost</Heading>
                    <FormSwitch
                        title="Fingir boost do servidor"
                        value={cfg.boost}
                        onChange={v => update({ boost: v })}
                        hideBorder={!cfg.boost}
                    />
                    {cfg.boost && (
                        <>
                            <Paragraph>Nível de boost</Paragraph>
                            <Select
                                options={[0, 1, 2, 3].map(n => ({ label: n === 0 ? "Sem boost" : `Nível ${n}`, value: n }))}
                                isSelected={(v: number) => v === cfg.boostTier}
                                select={(v: number) => update({ boostTier: v })}
                                serialize={(v: number) => String(v)}
                            />
                            <NumberField label="Quantidade de boosts" value={cfg.boostCount} onChange={v => update({ boostCount: v })} />
                        </>
                    )}
                </div>
            </ModalContent>

            <ModalFooter>
                <Button variant="primary" onClick={modalProps.onClose}>Fechar</Button>
                <Button variant="dangerSecondary" onClick={reset}>Resetar</Button>
            </ModalFooter>
        </ModalRoot>
    );
}
