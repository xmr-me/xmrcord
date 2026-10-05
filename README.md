<div align="center">

# Xmrcord

**Uma build privada do [Vencord](https://github.com/Vendicated/Vencord) para a mente e os amigos.**

Mesmo Discord, com os plugins extras do nosso círculo e um instalador próprio.
Preto, laranja Monero, atualização automática.

</div>

---

> [!IMPORTANT]
> **Xmrcord é um fork do [Vencord](https://github.com/Vendicated/Vencord).** Todo o mérito do
> client mod em si é do Vendicated e dos contribuidores do Vencord. Este repositório apenas
> re-embala o Vencord com alguns plugins próprios, uma identidade visual e um instalador para
> distribuir entre amigos. Veja os **[Créditos](#créditos)**.

## O que é

Xmrcord é o Vencord com:

- **Plugins próprios** (em `src/userplugins/`) — feitos para o nosso uso.
- **Marca Xmrcord** no lugar de Vencord na interface (configurações, updater, notificações).
- **Instalador gráfico** (`installer/`) com o visual XMR, que funciona no **Discord Stable, PTB e Canary**.
- **Auto-update** a partir deste repositório: quando eu adiciono um plugin e dou `push`, o GitHub
  recompila e todos os clientes se atualizam sozinhos.

## Instalar (para os amigos)

1. Baixe o **`XmrcordInstaller.exe`** na [última release](https://github.com/xmr-me/xmrcord/releases/latest).
2. Feche o Discord (o instalador oferece fazer isso).
3. Abra o `XmrcordInstaller.exe`, marque as versões do Discord que você usa (Stable / PTB / Canary)
   e clique em **Instalar**.
4. Abra o Discord. Em **Configurações** vai aparecer a seção **Xmrcord**.

> Não precisa de admin — a instalação é só para o seu usuário.
> Para remover, abra o instalador de novo e clique em **Desinstalar**.

### Como funciona a atualização

O Xmrcord checa as releases deste repositório ao abrir. Quando há uma build mais nova, baixa os
arquivos e aplica (ligado por padrão em **Configurações → Xmrcord → Updater → "Automatically
update"**). Ou seja: depois de instalado uma vez, os amigos não precisam baixar nada de novo.

## Desenvolvimento (para mim)

Pré-requisitos: Node 22+ e pnpm (via corepack).

```bash
corepack pnpm install          # dependências
corepack pnpm build            # build desktop -> dist/
corepack pnpm testTsc          # type-check
```

Plugins próprios ficam em `src/userplugins/<nome>/` e são descobertos automaticamente pelo build.

### Publicar uma atualização para todo mundo

1. Adicione/edite um plugin em `src/userplugins/`.
2. Commit + `git push` para a branch `main`.
3. O workflow **[`.github/workflows/xmrcord-release.yml`](.github/workflows/xmrcord-release.yml)**
   recompila e atualiza a release `latest` com os arquivos novos.
4. Os clientes dos amigos pegam a atualização sozinhos na próxima vez que abrirem o Discord.

### Compilar o instalador

O instalador é um app WPF em C# (sem dependências — usa o compilador do .NET Framework que já
vem no Windows). Veja **[`installer/README.md`](installer/README.md)**.

## Créditos

Xmrcord **não existiria sem o [Vencord](https://github.com/Vendicated/Vencord)** — ele *é* o Vencord.

- **[Vencord](https://github.com/Vendicated/Vencord)** — o client mod, por
  [Vendicated](https://github.com/Vendicated) e [todos os contribuidores](https://github.com/Vendicated/Vencord/graphs/contributors).
  Licença GPL-3.0-or-later.
- **Plugin `FollowVoiceUser`** — por [TheArmagan](https://github.com/ArmaganGaming).
- Plugins `BadgeVoiceFinder`, `MessageCleaner`, `ServerFaker` e a marca Xmrcord — por s0i4x.

Se você quer o Discord client mod de verdade, instale o **Vencord oficial**:
<https://vencord.dev>.

## Licença

[GPL-3.0-or-later](LICENSE), a mesma do Vencord.
