/*
 * Xmrcord Installer — a dependency-free WPF installer for the Xmrcord Discord client mod.
 * Patches Discord Stable / PTB / Canary via the asar-stub method, downloads the latest build
 * from the GitHub release, and migrates any existing Vencord settings.
 *
 * Xmrcord is a fork of Vencord (https://github.com/Vendicated/Vencord), GPL-3.0-or-later.
 * Written for C# 5 so it compiles with the in-box .NET Framework csc.exe (no SDK required).
 *
 * Fonts: Poppins (OFL), embedded and loaded at runtime. Icon: Monero-chan.
 */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using Path = System.IO.Path; // disambiguate from System.Windows.Shapes.Path

namespace XmrcordInstaller
{
    internal class Flavor
    {
        public string Name;         // "Discord Canary"
        public string FolderName;   // "DiscordCanary"  (under %LOCALAPPDATA%)
        public string ProcessName;  // "DiscordCanary"  (exe + taskkill)
        public Brush Brand;         // fallback tile colour
        public string ResourcesPath;// resolved resources dir, or null
        public string VersionText;  // "1.0.1202", or null
        public CheckBox Box;        // UI
        public Border IconHost;     // UI icon container
        public TextBlock Status;    // UI status line

        public Flavor(string name, string folder, string proc, Brush brand)
        {
            Name = name; FolderName = folder; ProcessName = proc; Brand = brand;
        }
    }

    public class MainWindow : Window
    {
        // ---- palette (XMR) ----
        static readonly Brush Ink      = Hex("#0b0b0e");
        static readonly Brush Panel    = Hex("#111114");
        static readonly Brush Card     = Hex("#16161a");
        static readonly Brush Edge     = Hex("#242429");
        static readonly Brush Fog      = Hex("#f4f4f5");
        static readonly Brush Mute     = Hex("#8a8a93");
        static readonly Brush Ember    = Hex("#f26822");
        static readonly Brush EmberHi  = Hex("#ff8a4c");
        static readonly Brush Graphite = Hex("#4d4d4d");
        static readonly Brush BullGreen= Hex("#34d399");
        static readonly Brush Faint    = Hex("#55555c");

        // Discord logo (brand page), viewBox 0 0 127.14 96.36
        const string DISCORD_LOGO = "M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z";

        // ---- constants ----
        const string RELEASE_BASE = "https://github.com/xmr-me/xmrcord/releases/latest/download/";
        static readonly string[] DIST_FILES = { "patcher.js", "preload.js", "renderer.js", "renderer.css" };
        static readonly string[] OPTIONAL_FILES = { "patcher.js.LEGAL.txt", "renderer.js.LEGAL.txt" };

        static readonly string APPDATA = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        static readonly string LOCALAPPDATA = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        static readonly string XMR_DIR = Path.Combine(APPDATA, "Xmrcord");
        static readonly string XMR_DIST = Path.Combine(XMR_DIR, "dist");
        static readonly string VEN_DIR = Path.Combine(APPDATA, "Vencord");

        static FontFamily Poppins;          // loaded from embedded resources
        static ControlTemplate CheckTpl;    // shared custom checkbox template

        readonly List<Flavor> flavors = new List<Flavor>();
        TextBox log;
        ProgressBar progress;
        Button installBtn, uninstallBtn;
        bool busy;

        // =====================================================================
        [STAThread]
        public static void Main()
        {
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
            LoadFonts();
            var app = new Application();
            app.Run(new MainWindow());
        }

        // =====================================================================
        //  UI
        // =====================================================================
        public MainWindow()
        {
            flavors.Add(new Flavor("Discord Stable", "Discord", "Discord", Hex("#5865F2")));
            flavors.Add(new Flavor("Discord PTB", "DiscordPTB", "DiscordPTB", Hex("#5865F2"))); // mirrors Stable
            flavors.Add(new Flavor("Discord Canary", "DiscordCanary", "DiscordCanary", Hex("#f6b40c")));

            CheckTpl = BuildCheckTemplate();

            Title = "Xmrcord Installer";
            Width = 560; Height = 664;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            ResizeMode = ResizeMode.NoResize;
            SnapsToDevicePixels = true;
            FontFamily = Poppins;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Ideal);

            var icon = LoadPng("monero-chan.png");
            if (icon != null) Icon = icon;

            var shell = new Border();
            shell.Margin = new Thickness(18);
            shell.CornerRadius = new CornerRadius(16);
            shell.Background = Ink;
            shell.BorderBrush = Edge;
            shell.BorderThickness = new Thickness(1);
            var shadow = new DropShadowEffect();
            shadow.BlurRadius = 42; shadow.ShadowDepth = 0; shadow.Opacity = 0.65; shadow.Color = Colors.Black;
            shell.Effect = shadow;

            var root = new Grid();
            root.RowDefinitions.Add(Row(GridLength.Auto));
            root.RowDefinitions.Add(Row(GridLength.Auto));
            root.RowDefinitions.Add(Row(new GridLength(1, GridUnitType.Star)));
            root.RowDefinitions.Add(Row(GridLength.Auto));

            root.Children.Add(TitleBar());
            root.Children.Add(Header());
            root.Children.Add(Body());
            root.Children.Add(Footer());

            shell.Child = root;
            Content = shell;

            Loaded += delegate { Detect(); };
        }

        UIElement TitleBar()
        {
            var bar = new Grid();
            bar.Height = 44;
            bar.Background = Brushes.Transparent;
            Grid.SetRow(bar, 0);
            bar.MouseLeftButtonDown += delegate(object s, MouseButtonEventArgs e) { try { DragMove(); } catch { } };

            var dot = new Ellipse(); dot.Width = 8; dot.Height = 8; dot.Fill = Ember;
            dot.HorizontalAlignment = HorizontalAlignment.Left; dot.VerticalAlignment = VerticalAlignment.Center;
            dot.Margin = new Thickness(20, 0, 0, 0);
            var tag = Text("INSTALADOR", 10.5, Mute, FontWeights.SemiBold);
            tag.HorizontalAlignment = HorizontalAlignment.Left; tag.VerticalAlignment = VerticalAlignment.Center;
            tag.Margin = new Thickness(36, 0, 0, 0);

            var close = new Button();
            close.Content = "✕";
            close.Width = 30; close.Height = 30;
            close.HorizontalAlignment = HorizontalAlignment.Right;
            close.VerticalAlignment = VerticalAlignment.Center;
            close.Margin = new Thickness(0, 0, 12, 0);
            close.Foreground = Mute;
            close.FontSize = 13;
            close.Cursor = Cursors.Hand;
            close.Template = GhostButtonTemplate();
            close.Click += delegate { Close(); };

            bar.Children.Add(dot);
            bar.Children.Add(tag);
            bar.Children.Add(close);
            return bar;
        }

        UIElement Header()
        {
            var panel = new StackPanel();
            panel.Orientation = Orientation.Horizontal;
            panel.Margin = new Thickness(24, 4, 24, 8);
            Grid.SetRow(panel, 1);

            panel.Children.Add(MoneroMark(40));

            var titles = new StackPanel();
            titles.Margin = new Thickness(14, 0, 0, 0);
            titles.VerticalAlignment = VerticalAlignment.Center;

            var wordmark = new TextBlock();
            wordmark.FontFamily = Poppins;
            wordmark.FontSize = 25;
            wordmark.FontWeight = FontWeights.Bold;
            wordmark.Inlines.Add(RunText("Xmr", Fog));
            wordmark.Inlines.Add(RunText("cord", Ember));
            titles.Children.Add(wordmark);

            var sub = Text("Discord Stable · PTB · Canary", 12, Mute, FontWeights.Normal);
            sub.Margin = new Thickness(1, 1, 0, 0);
            titles.Children.Add(sub);

            panel.Children.Add(titles);
            return panel;
        }

        UIElement Body()
        {
            var stack = new StackPanel();
            stack.Margin = new Thickness(24, 8, 24, 8);
            Grid.SetRow(stack, 2);

            var intro = Text("Escolha as versões do Discord para instalar o Xmrcord. Nada de admin — a instalação é só para o seu usuário.",
                12.5, Mute, FontWeights.Normal);
            intro.TextWrapping = TextWrapping.Wrap;
            intro.Margin = new Thickness(2, 0, 2, 14);
            stack.Children.Add(intro);

            foreach (var f in flavors)
                stack.Children.Add(FlavorCard(f));

            progress = new ProgressBar();
            progress.Height = 4;
            progress.Minimum = 0; progress.Maximum = 100; progress.Value = 0;
            progress.Margin = new Thickness(2, 10, 2, 8);
            progress.Foreground = Ember;
            progress.Background = Edge;
            progress.BorderThickness = new Thickness(0);
            stack.Children.Add(progress);

            var logCard = new Border();
            logCard.Background = Hex("#0d0d10");
            logCard.BorderBrush = Edge;
            logCard.BorderThickness = new Thickness(1);
            logCard.CornerRadius = new CornerRadius(10);
            logCard.Height = 120;
            logCard.Padding = new Thickness(12, 9, 12, 9);

            log = new TextBox();
            log.IsReadOnly = true;
            log.Background = Brushes.Transparent;
            log.Foreground = Hex("#c8c8cf");
            log.BorderThickness = new Thickness(0);
            log.FontFamily = Poppins;
            log.FontSize = 11.5;
            log.TextWrapping = TextWrapping.Wrap;
            log.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
            log.Text = "Pronto.";
            logCard.Child = log;
            stack.Children.Add(logCard);

            return stack;
        }

        UIElement FlavorCard(Flavor f)
        {
            var card = new Border();
            card.Background = Card;
            card.BorderBrush = Edge;
            card.BorderThickness = new Thickness(1);
            card.CornerRadius = new CornerRadius(12);
            card.Margin = new Thickness(0, 0, 0, 8);
            card.Padding = new Thickness(12, 10, 14, 10);

            var grid = new Grid();
            grid.ColumnDefinitions.Add(Col(GridLength.Auto));
            grid.ColumnDefinitions.Add(Col(new GridLength(1, GridUnitType.Star)));
            grid.ColumnDefinitions.Add(Col(GridLength.Auto));

            // icon host (rounded, clipped)
            var iconHost = new Border();
            iconHost.Width = 38; iconHost.Height = 38;
            iconHost.CornerRadius = new CornerRadius(10);
            iconHost.ClipToBounds = true;
            iconHost.Background = Hex("#1d1d22");
            iconHost.VerticalAlignment = VerticalAlignment.Center;
            iconHost.Margin = new Thickness(0, 0, 12, 0);
            f.IconHost = iconHost;
            Grid.SetColumn(iconHost, 0);
            grid.Children.Add(iconHost);

            var left = new StackPanel();
            left.VerticalAlignment = VerticalAlignment.Center;
            left.Children.Add(Text(f.Name, 14, Fog, FontWeights.SemiBold));
            f.Status = Text("verificando…", 11.5, Mute, FontWeights.Normal);
            f.Status.Margin = new Thickness(0, 1, 0, 0);
            left.Children.Add(f.Status);
            Grid.SetColumn(left, 1);
            grid.Children.Add(left);

            var box = new CheckBox();
            box.VerticalAlignment = VerticalAlignment.Center;
            box.IsEnabled = false;
            box.Template = CheckTpl;
            box.Cursor = Cursors.Hand;
            f.Box = box;
            Grid.SetColumn(box, 2);
            grid.Children.Add(box);

            card.Child = grid;
            return card;
        }

        UIElement Footer()
        {
            var grid = new Grid();
            grid.Margin = new Thickness(24, 6, 24, 18);
            Grid.SetRow(grid, 3);
            grid.RowDefinitions.Add(Row(GridLength.Auto));
            grid.RowDefinitions.Add(Row(GridLength.Auto));

            var buttons = new Grid();
            buttons.ColumnDefinitions.Add(Col(new GridLength(1, GridUnitType.Star)));
            buttons.ColumnDefinitions.Add(Col(new GridLength(12)));
            buttons.ColumnDefinitions.Add(Col(GridLength.Auto));
            Grid.SetRow(buttons, 0);

            installBtn = PrimaryButton("Instalar");
            installBtn.Click += delegate { Run(false); };
            Grid.SetColumn(installBtn, 0);
            buttons.Children.Add(installBtn);

            uninstallBtn = GhostButton("Desinstalar");
            Grid.SetColumn(uninstallBtn, 2);
            uninstallBtn.Click += delegate { Run(true); };
            buttons.Children.Add(uninstallBtn);

            grid.Children.Add(buttons);

            var credit = new TextBlock();
            credit.FontFamily = Poppins;
            credit.FontSize = 11;
            credit.Foreground = Faint;
            credit.Margin = new Thickness(2, 12, 0, 0);
            credit.TextWrapping = TextWrapping.Wrap;
            credit.Inlines.Add(RunText("Baseado no Vencord · GPL-3.0 · ", Faint));
            credit.Inlines.Add(RunText("github.com/Vendicated/Vencord", Hex("#6a6a72")));
            Grid.SetRow(credit, 1);
            grid.Children.Add(credit);

            return grid;
        }

        // =====================================================================
        //  detection
        // =====================================================================
        void Detect()
        {
            foreach (var f in flavors) ResolveResources(f);

            // Discord PTB shows the same icon as Discord Stable (per request).
            ImageSource stableSrc = null;
            var stable = flavors[0];
            if (stable.ResourcesPath != null)
            {
                var exe = Path.Combine(Path.GetDirectoryName(stable.ResourcesPath), stable.ProcessName + ".exe");
                if (File.Exists(exe)) stableSrc = ExtractIcon(exe);
            }

            int found = 0;
            foreach (var f in flavors)
            {
                SetFlavorIcon(f, stableSrc);

                if (f.ResourcesPath != null)
                {
                    found++;
                    f.Box.IsEnabled = true;
                    f.Box.IsChecked = true;
                    f.Status.Text = "encontrado • v" + f.VersionText;
                    f.Status.Foreground = BullGreen;
                }
                else
                {
                    f.Box.IsEnabled = false;
                    f.Box.IsChecked = false;
                    f.Status.Text = "não instalado";
                    f.Status.Foreground = Faint;
                }
            }
            Log(found == 0
                ? "Nenhum Discord encontrado. Instale o Discord primeiro."
                : "Discord detectado. Clique em Instalar.");
        }

        void ResolveResources(Flavor f)
        {
            try
            {
                var baseDir = Path.Combine(LOCALAPPDATA, f.FolderName);
                if (!Directory.Exists(baseDir)) return;

                string best = null; Version bestVer = null;
                foreach (var dir in Directory.GetDirectories(baseDir, "app-*"))
                {
                    Version v;
                    if (!Version.TryParse(Path.GetFileName(dir).Substring(4), out v)) continue;
                    if (!Directory.Exists(Path.Combine(dir, "resources"))) continue;
                    if (bestVer == null || v > bestVer) { bestVer = v; best = dir; }
                }
                if (best != null) { f.ResourcesPath = Path.Combine(best, "resources"); f.VersionText = bestVer.ToString(); }
            }
            catch { }
        }

        void SetFlavorIcon(Flavor f, ImageSource stableSrc)
        {
            bool isPtb = f.FolderName == "DiscordPTB";

            // PTB always mirrors Stable's icon; the others use their own installed icon.
            ImageSource src = null;
            if (isPtb) src = stableSrc;
            else if (f.ResourcesPath != null)
            {
                var exe = Path.Combine(Path.GetDirectoryName(f.ResourcesPath), f.ProcessName + ".exe");
                if (File.Exists(exe)) src = ExtractIcon(exe);
            }

            UIElement content;
            if (src != null)
            {
                var img = new Image();
                img.Source = src;
                img.Stretch = Stretch.UniformToFill;
                RenderOptions.SetBitmapScalingMode(img, BitmapScalingMode.HighQuality);
                content = img;
                f.IconHost.Opacity = 1.0;
            }
            else
            {
                content = BrandTile(f); // PTB brand == Stable blurple, so this still matches Stable
                f.IconHost.Opacity = (isPtb || f.ResourcesPath != null) ? 1.0 : 0.4;
            }
            f.IconHost.Child = content;
        }

        // =====================================================================
        //  install / uninstall (worker thread)
        // =====================================================================
        void Run(bool uninstall)
        {
            if (busy) return;

            var chosen = new List<Flavor>();
            foreach (var f in flavors)
                if (f.ResourcesPath != null && f.Box.IsChecked == true) chosen.Add(f);

            if (chosen.Count == 0) { Log("Selecione pelo menos uma versão do Discord."); return; }

            SetBusy(true);
            SetProgress(0);
            log.Text = "";

            var worker = new Thread(delegate ()
            {
                try { if (uninstall) DoUninstall(chosen); else DoInstall(chosen); }
                catch (Exception ex) { Log("ERRO: " + ex.Message); }
                finally { SetProgress(100); SetBusy(false); }
            });
            worker.IsBackground = true;
            worker.SetApartmentState(ApartmentState.STA);
            worker.Start();
        }

        void DoInstall(List<Flavor> chosen)
        {
            Log("Fechando o Discord…");
            KillDiscords(chosen);
            Thread.Sleep(1200);
            SetProgress(10);

            Directory.CreateDirectory(XMR_DIST);

            Log("Baixando a última build do Xmrcord…");
            var wc = NewClient();
            int i = 0;
            foreach (var file in DIST_FILES)
            {
                Log("  ↓ " + file);
                wc.DownloadFile(RELEASE_BASE + file, Path.Combine(XMR_DIST, file));
                i++;
                SetProgress(10 + (int)(55.0 * i / DIST_FILES.Length));
            }
            foreach (var file in OPTIONAL_FILES)
                try { wc.DownloadFile(RELEASE_BASE + file, Path.Combine(XMR_DIST, file)); } catch { }
            SetProgress(70);

            MigrateVencordSettings();

            var stub = BuildAsarStub(Path.Combine(XMR_DIST, "patcher.js"));
            int done = 0;
            foreach (var f in chosen)
            {
                Log("Aplicando em " + f.Name + "…");
                PatchResources(f.ResourcesPath, stub);
                done++;
                SetProgress(70 + (int)(30.0 * done / chosen.Count));
            }

            Log("");
            Log("✔ Instalado! Abra o Discord — a seção \"Xmrcord\" aparece nas Configurações.");
        }

        void DoUninstall(List<Flavor> chosen)
        {
            Log("Fechando o Discord…");
            KillDiscords(chosen);
            Thread.Sleep(1200);
            SetProgress(30);

            int done = 0;
            foreach (var f in chosen)
            {
                Log("Restaurando " + f.Name + "…");
                RestoreResources(f.ResourcesPath);
                done++;
                SetProgress(30 + (int)(70.0 * done / chosen.Count));
            }

            Log("");
            Log("✔ Desinstalado. O Discord voltou ao original.");
            Log("(Seus dados em %APPDATA%\\Xmrcord foram mantidos.)");
        }

        // =====================================================================
        //  patching
        // =====================================================================
        void PatchResources(string resources, byte[] stub)
        {
            var appAsar = Path.Combine(resources, "app.asar");
            var backup = Path.Combine(resources, "_app.asar");

            if (!File.Exists(backup))
            {
                if (!File.Exists(appAsar)) { Log("  ! app.asar não encontrado — pulando."); return; }
                if (IsStub(appAsar)) { Log("  ! app.asar já é um stub sem backup — repare o Discord. Pulando."); return; }
                File.Move(appAsar, backup);
            }

            if (File.Exists(appAsar)) File.Delete(appAsar);
            File.WriteAllBytes(appAsar, stub);
            Log("  ✓ " + Path.GetFileName(Path.GetDirectoryName(resources)));
        }

        void RestoreResources(string resources)
        {
            var appAsar = Path.Combine(resources, "app.asar");
            var backup = Path.Combine(resources, "_app.asar");
            if (!File.Exists(backup)) { Log("  ! sem backup (já estava limpo?) — pulando."); return; }
            if (File.Exists(appAsar)) File.Delete(appAsar);
            File.Move(backup, appAsar);
            Log("  ✓ restaurado");
        }

        static bool IsStub(string path)
        {
            try { return new FileInfo(path).Length < 50000; } catch { return false; }
        }

        static byte[] BuildAsarStub(string patcherPath)
        {
            var indexJs = "require(" + JsString(patcherPath) + ")";
            var pkgJson = "{\n\t\"name\": \"discord\",\n\t\"main\": \"index.js\"\n}";
            var idx = Encoding.UTF8.GetBytes(indexJs);
            var pkg = Encoding.UTF8.GetBytes(pkgJson);

            var header = "{\"files\":{\"index.js\":{\"size\":" + idx.Length + ",\"offset\":\"0\"},"
                       + "\"package.json\":{\"size\":" + pkg.Length + ",\"offset\":\"" + idx.Length + "\"}}}";
            var hb = Encoding.UTF8.GetBytes(header);
            int pad = (4 - (hb.Length % 4)) % 4;
            if (pad > 0) { header += new string(' ', pad); hb = Encoding.UTF8.GetBytes(header); }
            int strLen = hb.Length;

            var ms = new MemoryStream();
            WriteU32(ms, 4);
            WriteU32(ms, (uint)(strLen + 8));
            WriteU32(ms, (uint)(strLen + 4));
            WriteU32(ms, (uint)strLen);
            ms.Write(hb, 0, hb.Length);
            ms.Write(idx, 0, idx.Length);
            ms.Write(pkg, 0, pkg.Length);
            return ms.ToArray();
        }

        static void WriteU32(Stream s, uint v)
        {
            s.WriteByte((byte)(v & 0xff));
            s.WriteByte((byte)((v >> 8) & 0xff));
            s.WriteByte((byte)((v >> 16) & 0xff));
            s.WriteByte((byte)((v >> 24) & 0xff));
        }

        static string JsString(string s)
        {
            return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
        }

        // =====================================================================
        //  settings migration + process control
        // =====================================================================
        void MigrateVencordSettings()
        {
            try
            {
                if (!Directory.Exists(VEN_DIR)) return;
                if (Directory.Exists(Path.Combine(XMR_DIR, "settings"))) return;

                bool any = false;
                foreach (var sub in new[] { "settings", "themes" })
                {
                    var src = Path.Combine(VEN_DIR, sub);
                    if (Directory.Exists(src)) { CopyDir(src, Path.Combine(XMR_DIR, sub)); any = true; }
                }
                if (any) Log("Importadas as configurações do Vencord.");
            }
            catch (Exception ex) { Log("  (migração ignorada: " + ex.Message + ")"); }
        }

        static void CopyDir(string src, string dst)
        {
            Directory.CreateDirectory(dst);
            foreach (var file in Directory.GetFiles(src))
                File.Copy(file, Path.Combine(dst, Path.GetFileName(file)), true);
            foreach (var dir in Directory.GetDirectories(src))
                CopyDir(dir, Path.Combine(dst, Path.GetFileName(dir)));
        }

        void KillDiscords(List<Flavor> chosen)
        {
            foreach (var f in chosen)
                try
                {
                    foreach (var p in Process.GetProcessesByName(f.ProcessName))
                        try { p.Kill(); p.WaitForExit(4000); } catch { }
                }
                catch { }
        }

        static WebClient NewClient()
        {
            var wc = new WebClient();
            wc.Headers.Add("User-Agent", "XmrcordInstaller");
            return wc;
        }

        // =====================================================================
        //  assets (fonts, png icon, exe icons)
        // =====================================================================
        static void LoadFonts()
        {
            try
            {
                var dir = Path.Combine(Path.GetTempPath(), "XmrcordInstallerAssets");
                Directory.CreateDirectory(dir);
                var asm = Assembly.GetExecutingAssembly();
                foreach (var name in asm.GetManifestResourceNames())
                {
                    if (!name.EndsWith(".ttf", StringComparison.OrdinalIgnoreCase)) continue;
                    var dest = Path.Combine(dir, name);
                    try
                    {
                        using (var s = asm.GetManifestResourceStream(name))
                        using (var fsOut = File.Create(dest))
                            s.CopyTo(fsOut);
                    }
                    catch { }
                }
                Poppins = new FontFamily(new Uri(dir + "\\"), "./#Poppins");
            }
            catch { Poppins = new FontFamily("Segoe UI"); }
        }

        static ImageSource LoadPng(string resName)
        {
            try
            {
                var asm = Assembly.GetExecutingAssembly();
                using (var s = asm.GetManifestResourceStream(resName))
                {
                    if (s == null) return null;
                    var bi = new BitmapImage();
                    bi.BeginInit();
                    bi.CacheOption = BitmapCacheOption.OnLoad;
                    bi.StreamSource = s;
                    bi.EndInit();
                    bi.Freeze();
                    return bi;
                }
            }
            catch { return null; }
        }

        static ImageSource ExtractIcon(string exePath)
        {
            try
            {
                using (var ico = System.Drawing.Icon.ExtractAssociatedIcon(exePath))
                {
                    if (ico == null) return null;
                    var src = Imaging.CreateBitmapSourceFromHIcon(ico.Handle, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
                    src.Freeze();
                    return src;
                }
            }
            catch { return null; }
        }

        // brand-coloured tile with the white Discord mark (fallback when no real icon)
        static UIElement BrandTile(Flavor f)
        {
            var grid = new Grid();
            grid.Background = f.Brand;
            try
            {
                var canvas = new Canvas();
                canvas.Width = 127.14; canvas.Height = 96.36;
                canvas.Children.Add(MakePath(DISCORD_LOGO, Brushes.White, null));
                var vb = new Viewbox();
                vb.Child = canvas; vb.Width = 21; vb.Height = 21; vb.Stretch = Stretch.Uniform;
                vb.HorizontalAlignment = HorizontalAlignment.Center;
                vb.VerticalAlignment = VerticalAlignment.Center;
                grid.Children.Add(vb);
            }
            catch { }
            return grid;
        }

        // =====================================================================
        //  UI helpers (thread-safe)
        // =====================================================================
        void Log(string line)
        {
            Dispatcher.Invoke(new Action(delegate
            {
                log.Text = (log.Text.Length == 0 ? "" : log.Text + "\n") + line;
                log.ScrollToEnd();
            }));
        }

        void SetProgress(int pct) { Dispatcher.Invoke(new Action(delegate { progress.Value = pct; })); }

        void SetBusy(bool b)
        {
            Dispatcher.Invoke(new Action(delegate
            {
                busy = b;
                installBtn.IsEnabled = !b;
                uninstallBtn.IsEnabled = !b;
                installBtn.Content = b ? "Trabalhando…" : "Instalar";
            }));
        }

        // =====================================================================
        //  widget factory
        // =====================================================================
        static Brush Hex(string hex)
        {
            var b = (Brush)new BrushConverter().ConvertFromString(hex);
            b.Freeze();
            return b;
        }

        static TextBlock Text(string s, double size, Brush color, FontWeight weight)
        {
            var t = new TextBlock();
            t.Text = s; t.FontSize = size; t.Foreground = color; t.FontWeight = weight;
            t.FontFamily = Poppins;
            return t;
        }

        static System.Windows.Documents.Run RunText(string s, Brush color)
        {
            var r = new System.Windows.Documents.Run(s);
            r.Foreground = color;
            return r;
        }

        static RowDefinition Row(GridLength h) { var r = new RowDefinition(); r.Height = h; return r; }
        static ColumnDefinition Col(GridLength w) { var c = new ColumnDefinition(); c.Width = w; return c; }

        Button PrimaryButton(string label)
        {
            var b = new Button();
            b.Content = label;
            b.Height = 44;
            b.Foreground = Ink;
            b.FontSize = 14.5;
            b.FontWeight = FontWeights.SemiBold;
            b.FontFamily = Poppins;
            b.Cursor = Cursors.Hand;
            b.Template = FilledButtonTemplate();
            return b;
        }

        Button GhostButton(string label)
        {
            var b = new Button();
            b.Content = label;
            b.Height = 44;
            b.Padding = new Thickness(20, 0, 20, 0);
            b.Foreground = Fog;
            b.FontSize = 14;
            b.FontWeight = FontWeights.Medium;
            b.FontFamily = Poppins;
            b.Cursor = Cursors.Hand;
            b.Template = OutlineButtonTemplate();
            return b;
        }

        ControlTemplate FilledButtonTemplate()
        {
            var t = new ControlTemplate(typeof(Button));
            var border = new FrameworkElementFactory(typeof(Border));
            border.Name = "bd";
            border.SetValue(Border.BackgroundProperty, Ember);
            border.SetValue(Border.CornerRadiusProperty, new CornerRadius(10));
            var cp = new FrameworkElementFactory(typeof(ContentPresenter));
            cp.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            cp.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
            border.AppendChild(cp);
            t.VisualTree = border;

            var hover = new Trigger(); hover.Property = Button.IsMouseOverProperty; hover.Value = true;
            hover.Setters.Add(new Setter(Border.BackgroundProperty, EmberHi, "bd"));
            var disabled = new Trigger(); disabled.Property = Button.IsEnabledProperty; disabled.Value = false;
            disabled.Setters.Add(new Setter(Border.BackgroundProperty, Graphite, "bd"));
            t.Triggers.Add(hover);
            t.Triggers.Add(disabled);
            return t;
        }

        ControlTemplate OutlineButtonTemplate()
        {
            var t = new ControlTemplate(typeof(Button));
            var border = new FrameworkElementFactory(typeof(Border));
            border.Name = "bd";
            border.SetValue(Border.BackgroundProperty, Card);
            border.SetValue(Border.BorderBrushProperty, Edge);
            border.SetValue(Border.BorderThicknessProperty, new Thickness(1));
            border.SetValue(Border.CornerRadiusProperty, new CornerRadius(10));
            var cp = new FrameworkElementFactory(typeof(ContentPresenter));
            cp.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            cp.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
            border.AppendChild(cp);
            t.VisualTree = border;

            var hover = new Trigger(); hover.Property = Button.IsMouseOverProperty; hover.Value = true;
            hover.Setters.Add(new Setter(Border.BorderBrushProperty, Ember, "bd"));
            t.Triggers.Add(hover);
            return t;
        }

        ControlTemplate GhostButtonTemplate()
        {
            var t = new ControlTemplate(typeof(Button));
            var border = new FrameworkElementFactory(typeof(Border));
            border.Name = "bd";
            border.SetValue(Border.BackgroundProperty, Brushes.Transparent);
            border.SetValue(Border.CornerRadiusProperty, new CornerRadius(8));
            var cp = new FrameworkElementFactory(typeof(ContentPresenter));
            cp.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            cp.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
            border.AppendChild(cp);
            t.VisualTree = border;

            var hover = new Trigger(); hover.Property = Button.IsMouseOverProperty; hover.Value = true;
            hover.Setters.Add(new Setter(Border.BackgroundProperty, Card, "bd"));
            hover.Setters.Add(new Setter(Button.ForegroundProperty, Fog));
            t.Triggers.Add(hover);
            return t;
        }

        // custom checkbox: rounded square, fills orange + white check when checked
        ControlTemplate BuildCheckTemplate()
        {
            var t = new ControlTemplate(typeof(CheckBox));
            var box = new FrameworkElementFactory(typeof(Border));
            box.Name = "box";
            box.SetValue(FrameworkElement.WidthProperty, 24.0);
            box.SetValue(FrameworkElement.HeightProperty, 24.0);
            box.SetValue(Border.CornerRadiusProperty, new CornerRadius(7));
            box.SetValue(Border.BorderThicknessProperty, new Thickness(2));
            box.SetValue(Border.BorderBrushProperty, Edge);
            box.SetValue(Border.BackgroundProperty, Hex("#1d1d22"));
            box.SetValue(Border.SnapsToDevicePixelsProperty, true);

            var check = new FrameworkElementFactory(typeof(System.Windows.Shapes.Path));
            check.Name = "check";
            check.SetValue(System.Windows.Shapes.Path.DataProperty, Geometry.Parse("M4,12 L9.5,17.5 L20,6"));
            check.SetValue(System.Windows.Shapes.Path.StrokeProperty, Brushes.White);
            check.SetValue(System.Windows.Shapes.Path.StrokeThicknessProperty, 2.6);
            check.SetValue(System.Windows.Shapes.Path.StrokeStartLineCapProperty, PenLineCap.Round);
            check.SetValue(System.Windows.Shapes.Path.StrokeEndLineCapProperty, PenLineCap.Round);
            check.SetValue(System.Windows.Shapes.Path.StrokeLineJoinProperty, PenLineJoin.Round);
            check.SetValue(UIElement.OpacityProperty, 0.0);
            check.SetValue(FrameworkElement.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            check.SetValue(FrameworkElement.VerticalAlignmentProperty, VerticalAlignment.Center);
            box.AppendChild(check);
            t.VisualTree = box;

            var hover = new Trigger(); hover.Property = UIElement.IsMouseOverProperty; hover.Value = true;
            hover.Setters.Add(new Setter(Border.BorderBrushProperty, EmberHi, "box"));

            var chk = new Trigger(); chk.Property = ToggleButton.IsCheckedProperty; chk.Value = true;
            chk.Setters.Add(new Setter(Border.BackgroundProperty, Ember, "box"));
            chk.Setters.Add(new Setter(Border.BorderBrushProperty, Ember, "box"));
            chk.Setters.Add(new Setter(UIElement.OpacityProperty, 1.0, "check"));

            var dis = new Trigger(); dis.Property = UIElement.IsEnabledProperty; dis.Value = false;
            dis.Setters.Add(new Setter(UIElement.OpacityProperty, 0.35, "box"));

            t.Triggers.Add(hover);
            t.Triggers.Add(chk);
            t.Triggers.Add(dis);
            return t;
        }

        // The official Monero symbol, rendered as vector paths.
        static UIElement MoneroMark(double size)
        {
            const string DISC = "M4128,2249.81C4128,3287,3287.26,4127.86,2250,4127.86S372,3287,372,2249.81,1212.76,371.75,2250,371.75,4128,1212.54,4128,2249.81Z";
            const string ORANGE = "M2250,371.75c-1036.89,0-1879.12,842.06-1877.8,1878,0.26,207.26,33.31,406.63,95.34,593.12h561.88V1263L2250,2483.57,3470.52,1263v1579.9h562c62.12-186.48,95-385.85,95.37-593.12C4129.66,1212.76,3287,372,2250,372Z";
            const string GRAPHITE = "M1969.3,2764.17l-532.67-532.7v994.14H1029.38l-384.29.07c329.63,540.8,925.35,902.56,1604.91,902.56S3525.31,3766.4,3855,3225.6H3063.25V2231.47l-532.7,532.7-280.61,280.61-280.62-280.61h0Z";

            var canvas = new Canvas();
            canvas.Width = 3756.09; canvas.Height = 3756.49;
            var shift = new TranslateTransform(-371.96, -371.75);
            canvas.Children.Add(MakePath(DISC, Brushes.White, shift));
            canvas.Children.Add(MakePath(ORANGE, Ember, shift));
            canvas.Children.Add(MakePath(GRAPHITE, Graphite, shift));

            var vb = new Viewbox();
            vb.Width = size; vb.Height = size; vb.Stretch = Stretch.Uniform;
            vb.Child = canvas;
            return vb;
        }

        static System.Windows.Shapes.Path MakePath(string data, Brush fill, Transform shift)
        {
            var p = new System.Windows.Shapes.Path();
            p.Data = Geometry.Parse(data);
            p.Fill = fill;
            if (shift != null) p.RenderTransform = shift;
            return p;
        }
    }
}
