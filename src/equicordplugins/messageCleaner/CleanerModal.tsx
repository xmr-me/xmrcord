/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 s0i4x and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Card } from "@components/Card";
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
import { useForceUpdater } from "@utils/react";
import { RenderModalProps } from "@vencord/discord-types";
import { openModal, ScrollerThin, Select, TextInput, useEffect, useState } from "@webpack/common";

import { cancelJob, CleanTarget, getJob, JobState, resetJob, startDelete, startScan, subscribe } from "./cleaner";

// These are exported as `never` by @utils/modal; cast to usable component types.
const ModalRoot = RawModalRoot as (props: any) => any;
const ModalHeader = RawModalHeader as (props: any) => any;
const ModalContent = RawModalContent as (props: any) => any;
const ModalFooter = RawModalFooter as (props: any) => any;
const ModalCloseButton = RawModalCloseButton as (props: any) => any;

const DELAY_OPTIONS = [
    { label: "1 segundo — rápido, mais chance de rate limit", value: 1000 },
    { label: "1,5 segundo — recomendado", value: 1500 },
    { label: "2,5 segundos — seguro", value: 2500 },
    { label: "4 segundos — bem lento, quase sem risco", value: 4000 }
];

export function openCleanerModal(target: CleanTarget) {
    // A finished job has nothing left to show; start fresh on the target that was clicked.
    const { phase } = getJob();
    if (phase === "done" || phase === "cancelled" || phase === "error") resetJob();

    openModal(props => <CleanerModal target={target} modalProps={props} />);
}

function useJob() {
    const forceUpdate = useForceUpdater();
    useEffect(() => subscribe(forceUpdate), []);
    return getJob();
}

function formatDuration(ms: number) {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function formatDateRange(queue: JobState["queue"]) {
    let oldest = Infinity;
    let newest = -Infinity;
    for (const { timestamp } of queue) {
        const time = Date.parse(timestamp);
        if (time < oldest) oldest = time;
        if (time > newest) newest = time;
    }
    const format = (time: number) => new Date(time).toLocaleDateString("pt-BR");
    return `de ${format(oldest)} até ${format(newest)}`;
}

function ProgressBar({ value, max }: { value: number; max: number; }) {
    const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
        <div style={{ height: 8, borderRadius: 4, overflow: "hidden", background: "var(--background-modifier-accent)" }}>
            <div style={{ width: `${percent}%`, height: "100%", background: "var(--brand-500)", transition: "width 0.2s" }} />
        </div>
    );
}

function RateLimitNotice({ job }: { job: JobState; }) {
    if (job.rateLimitWait <= 0) return null;
    return (
        <Card variant="warning">
            <Paragraph>
                O Discord pediu uma pausa (rate limit). Aguardando {formatDuration(job.rateLimitWait)} e continuando sozinho.
            </Paragraph>
        </Card>
    );
}

function CleanerModal({ target, modalProps }: { target: CleanTarget; modalProps: RenderModalProps; }) {
    const job = useJob();

    const [limit, setLimit] = useState("");
    const [contains, setContains] = useState("");
    const [includePinned, setIncludePinned] = useState(false);
    const [deleteDelay, setDeleteDelay] = useState(1500);

    const label = job.phase === "idle" ? target.label : job.label;
    const close = modalProps.onClose;
    const isBatch = target.chats.length !== 1;
    const closedCount = target.chats.filter(chat => !chat.channelId).length;

    let body: React.ReactNode;
    let footer: React.ReactNode;

    switch (job.phase) {
        case "idle":
            if (target.chats.length === 0) {
                body = <Paragraph>Você não tem amigos adicionados, então não há o que limpar.</Paragraph>;
                footer = <Button variant="primary" onClick={close}>Fechar</Button>;
                break;
            }

            body = <>
                {isBatch
                    ? <Card variant="warning">
                        <Paragraph>
                            Apaga somente as <strong>suas</strong> mensagens na conversa privada com cada um dos seus{" "}
                            <strong>{target.chats.length} amigos</strong>, incluindo as {closedCount} conversas que estão
                            fechadas na sua lista de mensagens diretas. Elas são só consultadas e continuam fechadas.
                            Grupos e servidores não são afetados.
                        </Paragraph>
                    </Card>
                    : <Paragraph style={{ opacity: 0.7 }}>
                        Apaga somente as <strong>suas</strong> mensagens em {label}.
                    </Paragraph>
                }
                <Paragraph style={{ opacity: 0.7 }}>
                    Primeiro o histórico é analisado, depois você vê quantas mensagens foram encontradas e só então confirma.
                    Mensagens apagadas não podem ser recuperadas.
                </Paragraph>

                <Heading tag="h5">Quantidade</Heading>
                <Paragraph style={{ opacity: 0.7 }}>
                    Quantas das suas mensagens mais recentes apagar{isBatch && " em cada conversa"}. Deixe vazio para apagar todas.
                </Paragraph>
                <TextInput
                    value={limit}
                    placeholder="todas"
                    spellCheck={false}
                    onChange={(v: string) => setLimit(v.replace(/[^\d]/g, ""))}
                />

                <Heading tag="h5">Filtro de texto</Heading>
                <Paragraph style={{ opacity: 0.7 }}>
                    Apaga só as mensagens que contêm este texto (sem diferenciar maiúsculas). Deixe vazio para não filtrar.
                </Paragraph>
                <TextInput
                    value={contains}
                    placeholder="qualquer texto"
                    spellCheck={false}
                    onChange={(v: string) => setContains(v)}
                />

                <FormSwitch
                    title="Apagar também mensagens fixadas"
                    description="Desligado, as suas mensagens fixadas no chat são mantidas."
                    value={includePinned}
                    onChange={setIncludePinned}
                />

                <Heading tag="h5">Intervalo entre exclusões</Heading>
                <Paragraph style={{ opacity: 0.7 }}>
                    Tempo de espera entre uma mensagem apagada e a próxima. Quanto maior, menor a chance de rate limit.
                    Se o Discord limitar mesmo assim, o plugin espera o tempo pedido e aumenta o intervalo sozinho.
                </Paragraph>
                <Select
                    options={DELAY_OPTIONS}
                    isSelected={(v: number) => v === deleteDelay}
                    select={(v: number) => setDeleteDelay(v)}
                    serialize={(v: number) => String(v)}
                />
            </>;
            footer = <>
                <Button
                    variant="primary"
                    onClick={() => startScan(target, { limit: Number(limit) || 0, contains, includePinned, deleteDelay })}
                >
                    Analisar mensagens
                </Button>
                <Button variant="secondary" onClick={close}>Cancelar</Button>
            </>;
            break;

        case "scanning":
            body = <>
                <Heading tag="h5">Analisando o histórico…</Heading>
                {job.chatCount > 1 && <>
                    <ProgressBar value={job.chatIndex} max={job.chatCount} />
                    <Paragraph>
                        Amigo {job.chatIndex + 1} de {job.chatCount}: {job.currentChat}
                    </Paragraph>
                </>}
                <Paragraph>
                    {job.read} mensagens lidas, {job.found} suas para apagar.
                </Paragraph>
                <Paragraph style={{ opacity: 0.7 }}>
                    Nada é apagado nesta etapa. Quando a análise terminar você confirma antes de começar.
                    Pode fechar esta janela: a análise continua e você reabre pelo mesmo menu.
                </Paragraph>
                <RateLimitNotice job={job} />
            </>;
            footer = <>
                <Button variant="dangerSecondary" onClick={cancelJob}>Cancelar análise</Button>
                <Button variant="secondary" onClick={close}>Continuar em segundo plano</Button>
            </>;
            break;

        case "review":
            body = <>
                {job.found === 0
                    ? <Paragraph>Nenhuma mensagem sua foi encontrada em {label} com essas opções.</Paragraph>
                    : <>
                        <Card variant="danger">
                            <Paragraph>
                                <strong>{job.found}</strong> mensagens suas serão apagadas em {label}, {formatDateRange(job.queue)}.
                            </Paragraph>
                        </Card>
                        {job.chatCount > 1 && <>
                            <Heading tag="h5">
                                Por conversa ({job.breakdown.length} de {job.chatCount} amigos têm mensagens suas)
                            </Heading>
                            <ScrollerThin fade style={{ maxHeight: 180 }}>
                                {job.breakdown.map(chat => (
                                    <Paragraph key={chat.label}>{chat.label} — {chat.count} mensagens</Paragraph>
                                ))}
                            </ScrollerThin>
                        </>}
                        <Paragraph style={{ opacity: 0.7 }}>
                            Tempo estimado: cerca de {formatDuration(job.found * (job.options.deleteDelay + 300))}.
                            Você pode cancelar a qualquer momento, mas o que já foi apagado não volta.
                        </Paragraph>
                    </>
                }
                {job.unreachable > 0 && (
                    <Card variant="warning">
                        <Paragraph>
                            {job.unreachable} conversas não puderam ser lidas (o Discord recusou o acesso) e ficaram de fora.
                        </Paragraph>
                    </Card>
                )}
            </>;
            footer = <>
                {job.found > 0 && (
                    <Button variant="dangerPrimary" onClick={startDelete}>Apagar {job.found} mensagens</Button>
                )}
                <Button variant="secondary" onClick={cancelJob}>Voltar</Button>
            </>;
            break;

        case "deleting": {
            const processed = job.deleted + job.failed;
            const remaining = job.found - processed;
            body = <>
                <Heading tag="h5">Apagando mensagens…</Heading>
                <ProgressBar value={processed} max={job.found} />
                <Paragraph>
                    {job.deleted} de {job.found} apagadas
                    {job.failed > 0 && `, ${job.failed} falharam`}
                    {" · "}restam cerca de {formatDuration(remaining * (job.options.deleteDelay + 300))}
                </Paragraph>
                <Paragraph style={{ opacity: 0.7 }}>
                    Pode fechar esta janela: a limpeza continua em segundo plano. Para acompanhar ou cancelar,
                    abra de novo pelo mesmo menu.
                </Paragraph>
                <RateLimitNotice job={job} />
            </>;
            footer = <>
                <Button variant="dangerPrimary" onClick={cancelJob}>Cancelar limpeza</Button>
                <Button variant="secondary" onClick={close}>Continuar em segundo plano</Button>
            </>;
            break;
        }

        default:
            body = <>
                {job.phase === "done" && (
                    <Card variant="success">
                        <Paragraph>Limpeza concluída: {job.deleted} mensagens apagadas em {label}.</Paragraph>
                    </Card>
                )}
                {job.phase === "cancelled" && (
                    <Card variant="warning">
                        <Paragraph>Cancelado. {job.deleted} mensagens foram apagadas antes de parar.</Paragraph>
                    </Card>
                )}
                {job.phase === "error" && (
                    <Card variant="danger">
                        <Paragraph>
                            A operação parou por um erro: {job.error}. {job.deleted} mensagens foram apagadas antes disso.
                        </Paragraph>
                    </Card>
                )}
                {job.failed > 0 && (
                    <Paragraph style={{ opacity: 0.7 }}>
                        {job.failed} mensagens não puderam ser apagadas (sem permissão, tópico arquivado ou mensagem de sistema).
                    </Paragraph>
                )}
            </>;
            footer = <>
                <Button variant="primary" onClick={close}>Fechar</Button>
                <Button variant="secondary" onClick={resetJob}>Nova limpeza</Button>
            </>;
    }

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader separator={false}>
                <Heading tag="h2" style={{ flex: 1, margin: 0 }}>Limpar mensagens: {label}</Heading>
                <ModalCloseButton onClick={close} />
            </ModalHeader>

            <ModalContent>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 16 }}>
                    {body}
                </div>
            </ModalContent>

            <ModalFooter>{footer}</ModalFooter>
        </ModalRoot>
    );
}
