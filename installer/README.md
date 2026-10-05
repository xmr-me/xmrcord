# Xmrcord Installer

Instalador gráfico (WPF) do Xmrcord, com o visual XMR. Sem dependências: compila com o
compilador C# que já vem no Windows (.NET Framework 4.x), não precisa de Visual Studio nem SDK.

## O que ele faz

- Detecta **Discord Stable, PTB e Canary** instalados no usuário.
- Para cada um escolhido: faz backup do `app.asar` original como `_app.asar` e grava um stub
  que carrega o Xmrcord de `%APPDATA%\Xmrcord\dist`.
- Baixa a última build da [release `latest`](https://github.com/xmr-me/xmrcord/releases/latest).
- Importa configurações de uma instalação antiga do Vencord, se existir.
- **Desinstalar** restaura o `app.asar` original.

Tudo no escopo do usuário — **não precisa de admin**.

## Compilar

```powershell
powershell -ExecutionPolicy Bypass -File installer\build.ps1
```

Saída: `installer\XmrcordInstaller.exe`.

Depois de uma release existir, anexe o `.exe` a ela para os amigos baixarem:

```powershell
gh release upload latest installer\XmrcordInstaller.exe --clobber
```

## Como funciona o patch (asar stub)

O Discord carrega `resources/app.asar`. O instalador renomeia o original para `_app.asar` e
grava no lugar um `app.asar` mínimo cujo `index.js` é só:

```js
require("C:\\Users\\<voce>\\AppData\\Roaming\\Xmrcord\\dist\\patcher.js")
```

O `patcher.js` do Xmrcord carrega o Discord real a partir de `_app.asar` e injeta os plugins.
É o mesmo método do instalador oficial do Vencord — o formato do stub foi validado byte-a-byte
contra uma instalação real.
