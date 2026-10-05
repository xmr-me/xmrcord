# Xmrcord Installer

Instalador gráfico (WPF) do Xmrcord, com o visual XMR. Sem dependências: compila com o
compilador C# que já vem no Windows (.NET Framework 4.x), não precisa de Visual Studio nem SDK.

## O que ele faz

- Detecta **Discord Stable, PTB e Canary** instalados no usuário (mostra o ícone de cada um).
- Para cada um escolhido: faz backup do `app.asar` original como `_app.asar` e coloca no lugar o
  **`desktop.asar`** do Xmrcord.
- Baixa o `desktop.asar` da [release `latest`](https://github.com/xmr-me/xmrcord/releases/latest).
- Importa configurações de uma instalação antiga do Vencord/Equicord, se existir.
- **Desinstalar** restaura o `app.asar` original.

Tudo no escopo do usuário — **não precisa de admin**.

## Compilar

```powershell
powershell -ExecutionPolicy Bypass -File installer\build.ps1
```

Embute a fonte Poppins (`installer/fonts/*.ttf`) e a Monero-chan (`installer/assets/monero-chan.png`),
e usa `installer/app.ico` como ícone do exe. Saída: `installer\XmrcordInstaller.exe`.

Depois, anexe o `.exe` à release para os amigos baixarem:

```powershell
gh release upload latest installer\XmrcordInstaller.exe --repo xmr-me/xmrcord --clobber
```

## Como funciona o patch

O Discord carrega `resources/app.asar`. O Xmrcord (base Equicord) é empacotado como um único
`desktop.asar`. O instalador renomeia o `app.asar` original para `_app.asar` e grava o
`desktop.asar` do Xmrcord como `app.asar`. O patcher dentro dele carrega o Discord real a partir
do `_app.asar`. É o mesmo método do instalador oficial do Equicord (Equilotl); o auto-update
sobrescreve esse `app.asar` sozinho quando sai uma build nova.
