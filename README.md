<div align="center">

# Xmrcord

**Uma build privada do Discord para a mente e os amigos — todos os plugins do Equicord e do Vencord, mais os nossos.**

Baseado no [Equicord](https://github.com/Equicord/Equicord) (que é baseado no [Vencord](https://github.com/Vendicated/Vencord)).
Preto, laranja Monero, instalador próprio e atualização automática.

</div>

---

> [!IMPORTANT]
> **Xmrcord é um fork do [Equicord](https://github.com/Equicord/Equicord)**, que por sua vez é um
> fork do **[Vencord](https://github.com/Vendicated/Vencord)**. Todo o mérito do client mod e dos
> plugins é do Vencord, do Equicord e de seus contribuidores. Este repositório só re-embala tudo
> com os nossos plugins, uma identidade visual e um instalador. Veja os **[Créditos](#créditos)**.

## O que tem aqui

- **Todos os plugins do Vencord + do Equicord** (centenas) — a maioria vem desligada; cada um liga
  o que quiser em **Configurações → Xmrcord → Plugins**.
- **Nossos plugins** (em `src/userplugins/`): BadgeVoiceFinder, MessageCleaner, ServerFaker, FollowVoiceUser.
- **Marca Xmrcord** no lugar de Equicord/Vencord na interface.
- **Instalador gráfico** (`installer/`) com visual XMR, para **Discord Stable, PTB e Canary**.
- **Auto-update** a partir deste repositório, com um **modal de changelog** mostrando o que mudou.

## Instalar (para os amigos)

1. Baixe o **`XmrcordInstaller.exe`** na [última release](https://github.com/xmr-me/xmrcord/releases/latest).
2. Feche o Discord (o instalador oferece fazer isso).
3. Abra o `XmrcordInstaller.exe`, marque as versões do Discord que você usa e clique em **Instalar**.
4. Abra o Discord. Em **Configurações** vai aparecer a seção **Xmrcord**.

> Sem admin. Para remover, abra o instalador de novo e clique em **Desinstalar**.
> A atualização vem ligada: quando sai uma build nova, o Xmrcord aplica e mostra um popup com o changelog.

## Desenvolvimento

```bash
corepack pnpm install          # dependências
corepack pnpm build            # build desktop -> dist/desktop.asar
corepack pnpm testTsc          # type-check
```

Nossos plugins ficam em `src/userplugins/<nome>/` (descobertos automaticamente pelo build).

### Publicar uma atualização para todo mundo

1. Edite/adicione um plugin, commit e `git push` para `main`.
2. O workflow **[`.github/workflows/xmrcord-release.yml`](.github/workflows/xmrcord-release.yml)**
   recompila e atualiza a release `latest` com o `desktop.asar`.
3. Os clientes dos amigos se atualizam sozinhos e mostram o changelog.

### Trazer plugins novos do Equicord/Vencord

```bash
node scripts/sync-upstream.mjs    # baixa os plugins mais recentes do Equicord (inclui os do Vencord)
corepack pnpm testTsc             # confere
```

O script atualiza `src/plugins` e `src/equicordplugins` a partir do Equicord e reaplica a marca Xmrcord.
Depois é só commit + push para distribuir.

### Instalador

App WPF em C# (sem dependências — usa o compilador do .NET Framework do Windows). Veja
**[`installer/README.md`](installer/README.md)**.

## Créditos

- **[Vencord](https://github.com/Vendicated/Vencord)** — o client mod original, por
  [Vendicated](https://github.com/Vendicated) e contribuidores. GPL-3.0.
- **[Equicord](https://github.com/Equicord/Equicord)** — o fork com os plugins extras em que o
  Xmrcord se baseia, por [thororen](https://github.com/thororen1234) e contribuidores. GPL-3.0.
- **Plugin `FollowVoiceUser`** — por [TheArmagan](https://github.com/ArmaganGaming).
- Plugins `BadgeVoiceFinder`, `MessageCleaner`, `ServerFaker` e a marca Xmrcord — por s0i4x.

## Licença

[GPL-3.0-or-later](LICENSE), a mesma do Vencord e do Equicord.
