/*
 * Xmrcord Installer — a dependency-free WPF installer for the Xmrcord Discord client mod.
 * Patches Discord Stable / PTB / Canary via the asar-stub method, downloads the latest build
 * from the GitHub release, and migrates any existing Vencord settings.
 *
 * Xmrcord is a fork of Vencord (https://github.com/Vendicated/Vencord), GPL-3.0-or-later.
 * Written for C# 5 so it compiles with the in-box .NET Framework csc.exe (no SDK required).
 */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Shapes;
using Path = System.IO.Path; // disambiguate from System.Windows.Shapes.Path

namespace XmrcordInstaller
{
    internal class Flavor
    {
        public string Name;         // "Discord Canary"
        public string FolderName;   // "DiscordCanary"  (under %LOCALAPPDATA%)
        public string ProcessName;  // "DiscordCanary"  (for taskkill)
        public string ResourcesPath;// resolved resources dir, or null
        public string VersionText;  // "1.0.1202", or null
        public CheckBox Box;        // UI control

        public Flavor(string name, string folder, string proc)
        {
            Name = name; FolderName = folder; ProcessName = proc;
        }
    }

    public class MainWindow : Window
    {
        // ---- palette (XMR) ----
        static readonly Brush Ink     = Hex("#0b0b0e");
        static readonly Brush Panel   = Hex("#111114");
        static readonly Brush Card    = Hex("#16161a");
        static readonly Brush Edge    = Hex("#242429");
        static readonly Brush Fog     = Hex("#f4f4f5");
        static readonly Brush Mute    = Hex("#8a8a93");
        static readonly Brush Ember   = Hex("#f26822");
        static readonly Brush EmberHi = Hex("#ff8a4c");
        static readonly Brush Graphite= Hex("#4d4d4d");
        static readonly Brush BullGreen = Hex("#34d399");

        // ---- constants ----
        const string RELEASE_BASE = "https://github.com/xmr-me/xmrcord/releases/latest/download/";
        static readonly string[] DIST_FILES = { "patcher.js", "preload.js", "renderer.js", "renderer.css" };
        static readonly string[] OPTIONAL_FILES = { "patcher.js.LEGAL.txt", "renderer.js.LEGAL.txt" };

        static readonly string APPDATA = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        static readonly string LOCALAPPDATA = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        static readonly string XMR_DIR = Path.Combine(APPDATA, "Xmrcord");
        static readonly string XMR_DIST = Path.Combine(XMR_DIR, "dist");
        static readonly string VEN_DIR = Path.Combine(APPDATA, "Vencord");

        readonly List<Flavor> flavors = new List<Flavor>();
        TextBox log;
        ProgressBar progress;
        Button installBtn, uninstallBtn;
        bool busy;

        // =====================================================================
        //  entry point
        // =====================================================================
        [STAThread]
        public static void Main()
        {
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // force TLS 1.2
            var app = new Application();
            app.Run(new MainWindow());
        }

        // =====================================================================
        //  UI
        // =====================================================================
        public MainWindow()
        {
            flavors.Add(new Flavor("Discord Stable", "Discord", "Discord"));
            flavors.Add(new Flavor("Discord PTB", "DiscordPTB", "DiscordPTB"));
            flavors.Add(new Flavor("Discord Canary", "DiscordCanary", "DiscordCanary"));

            Title = "Xmrcord Installer";
            Width = 560; Height = 660;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            ResizeMode = ResizeMode.NoResize;
            SnapsToDevicePixels = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Ideal);

            // floating card with a soft shadow
            var shell = new Border();
            shell.Margin = new Thickness(18);
            shell.CornerRadius = new CornerRadius(16);
            shell.Background = Ink;
            shell.BorderBrush = Edge;
            shell.BorderThickness = new Thickness(1);
            var shadow = new DropShadowEffect();
            shadow.BlurRadius = 42; shadow.ShadowDepth = 0; shadow.Opacity = 0.65;
            shadow.Color = Colors.Black;
            shell.Effect = shadow;

            var root = new Grid();
            root.RowDefinitions.Add(Row(GridLength.Auto));   // title bar
            root.RowDefinitions.Add(Row(GridLength.Auto));   // header
            root.RowDefinitions.Add(Row(new GridLength(1, GridUnitType.Star))); // body
            root.RowDefinitions.Add(Row(GridLength.Auto));   // footer

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
            close.Background = Brushes.Transparent;
            close.BorderThickness = new Thickness(0);
            close.Cursor = Cursors.Hand;
            close.FontSize = 13;
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
            wordmark.FontSize = 25;
            wordmark.FontWeight = FontWeights.Bold;
            wordmark.Foreground = Fog;
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

            // intro line
            var intro = Text("Escolha as versões do Discord para instalar o Xmrcord. Nada de admin — a instalação é só para o seu usuário.",
                12.5, Mute, FontWeights.Normal);
            intro.TextWrapping = TextWrapping.Wrap;
            intro.Margin = new Thickness(2, 0, 2, 14);
            stack.Children.Add(intro);

            // flavor cards
            foreach (var f in flavors)
                stack.Children.Add(FlavorCard(f));

            // progress + log
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
            logCard.Height = 128;
            logCard.Padding = new Thickness(10, 8, 10, 8);

            log = new TextBox();
            log.IsReadOnly = true;
            log.Background = Brushes.Transparent;
            log.Foreground = Hex("#c8c8cf");
            log.BorderThickness = new Thickness(0);
            log.FontFamily = new FontFamily("Consolas, monospace");
            log.FontSize = 11.5;
            log.TextWrapping = TextWrapping.Wrap;
            log.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
            log.VerticalContentAlignment = VerticalAlignment.Top;
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
            card.CornerRadius = new CornerRadius(10);
            card.Margin = new Thickness(0, 0, 0, 8);
            card.Padding = new Thickness(14, 10, 14, 10);

            var grid = new Grid();
            grid.ColumnDefinitions.Add(Col(new GridLength(1, GridUnitType.Star)));
            grid.ColumnDefinitions.Add(Col(GridLength.Auto));

            var left = new StackPanel();
            left.VerticalAlignment = VerticalAlignment.Center;
            var name = Text(f.Name, 14, Fog, FontWeights.SemiBold);
            left.Children.Add(name);
            var status = Text("verificando…", 11.5, Mute, FontWeights.Normal);
            status.Name = "status";
            left.Children.Add(status);
            Grid.SetColumn(left, 0);
            grid.Children.Add(left);

            var box = new CheckBox();
            box.VerticalAlignment = VerticalAlignment.Center;
            box.IsEnabled = false;
            box.LayoutTransform = new ScaleTransform(1.25, 1.25);
            Grid.SetColumn(box, 1);
            grid.Children.Add(box);

            f.Box = box;
            f.Box.Tag = status; // stash the status TextBlock for later update

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
            credit.FontSize = 11;
            credit.Foreground = Hex("#55555c");
            credit.Margin = new Thickness(2, 12, 0, 0);
            credit.TextWrapping = TextWrapping.Wrap;
            credit.Inlines.Add(RunText("Baseado no Vencord · GPL-3.0 · ", Hex("#55555c")));
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
            int found = 0;
            foreach (var f in flavors)
            {
                ResolveResources(f);
                var status = f.Box.Tag as TextBlock;
                if (f.ResourcesPath != null)
                {
                    found++;
                    f.Box.IsEnabled = true;
                    f.Box.IsChecked = true;
                    if (status != null) { status.Text = "encontrado • v" + f.VersionText; status.Foreground = BullGreen; }
                }
                else
                {
                    f.Box.IsEnabled = false;
                    f.Box.IsChecked = false;
                    if (status != null) { status.Text = "não instalado"; status.Foreground = Hex("#55555c"); }
                }
            }
            if (found == 0)
                Log("Nenhum Discord encontrado. Instale o Discord primeiro.");
            else
                Log("Discord detectado. Clique em Instalar.");
        }

        void ResolveResources(Flavor f)
        {
            try
            {
                var baseDir = Path.Combine(LOCALAPPDATA, f.FolderName);
                if (!Directory.Exists(baseDir)) return;

                string best = null;
                Version bestVer = null;
                foreach (var dir in Directory.GetDirectories(baseDir, "app-*"))
                {
                    var leaf = Path.GetFileName(dir);
                    var verStr = leaf.Substring(4); // after "app-"
                    Version v;
                    if (!Version.TryParse(verStr, out v)) continue;
                    if (!Directory.Exists(Path.Combine(dir, "resources"))) continue;
                    if (bestVer == null || v > bestVer) { bestVer = v; best = dir; }
                }

                if (best != null)
                {
                    f.ResourcesPath = Path.Combine(best, "resources");
                    f.VersionText = bestVer.ToString();
                }
            }
            catch { }
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
                try
                {
                    if (uninstall) DoUninstall(chosen);
                    else DoInstall(chosen);
                }
                catch (Exception ex)
                {
                    Log("ERRO: " + ex.Message);
                }
                finally
                {
                    SetProgress(uninstall ? 100 : 100);
                    SetBusy(false);
                }
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
            {
                try { wc.DownloadFile(RELEASE_BASE + file, Path.Combine(XMR_DIST, file)); } catch { }
            }
            SetProgress(70);

            MigrateVencordSettings();

            var patcher = Path.Combine(XMR_DIST, "patcher.js");
            var stub = BuildAsarStub(patcher);

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
                if (!File.Exists(appAsar))
                {
                    Log("  ! app.asar não encontrado — pulando.");
                    return;
                }
                if (IsStub(appAsar))
                {
                    Log("  ! app.asar já é um stub sem backup — repare o Discord e tente de novo. Pulando.");
                    return;
                }
                File.Move(appAsar, backup); // keep the real Discord asar as _app.asar
            }

            if (File.Exists(appAsar)) File.Delete(appAsar);
            File.WriteAllBytes(appAsar, stub);
            Log("  ✓ " + Path.GetFileName(Path.GetDirectoryName(resources)));
        }

        void RestoreResources(string resources)
        {
            var appAsar = Path.Combine(resources, "app.asar");
            var backup = Path.Combine(resources, "_app.asar");

            if (!File.Exists(backup))
            {
                Log("  ! sem backup (já estava limpo?) — pulando.");
                return;
            }
            if (File.Exists(appAsar)) File.Delete(appAsar);
            File.Move(backup, appAsar);
            Log("  ✓ restaurado");
        }

        static bool IsStub(string path)
        {
            try { return new FileInfo(path).Length < 50000; } catch { return false; }
        }

        // Builds a minimal Electron asar whose index.js is require("<patcherPath>").
        static byte[] BuildAsarStub(string patcherPath)
        {
            var indexJs = "require(" + JsString(patcherPath) + ")";
            var pkgJson = "{\n\t\"name\": \"discord\",\n\t\"main\": \"index.js\"\n}";
            var idx = Encoding.UTF8.GetBytes(indexJs);
            var pkg = Encoding.UTF8.GetBytes(pkgJson);

            var header = "{\"files\":{\"index.js\":{\"size\":" + idx.Length + ",\"offset\":\"0\"},"
                       + "\"package.json\":{\"size\":" + pkg.Length + ",\"offset\":\"" + idx.Length + "\"}}}";
            var hb = Encoding.UTF8.GetBytes(header);

            // pad the header to a 4-byte boundary with spaces (JSON.parse tolerates trailing space)
            int pad = (4 - (hb.Length % 4)) % 4;
            if (pad > 0)
            {
                header = header + new string(' ', pad);
                hb = Encoding.UTF8.GetBytes(header);
            }
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

        // JS string literal: wrap in quotes, escape backslashes and quotes.
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
                var destSettings = Path.Combine(XMR_DIR, "settings");
                if (Directory.Exists(destSettings)) return; // never overwrite existing Xmrcord data

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
            {
                try
                {
                    foreach (var p in Process.GetProcessesByName(f.ProcessName))
                    {
                        try { p.Kill(); p.WaitForExit(4000); } catch { }
                    }
                }
                catch { }
            }
        }

        static WebClient NewClient()
        {
            var wc = new WebClient();
            wc.Headers.Add("User-Agent", "XmrcordInstaller");
            return wc;
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

        void SetProgress(int pct)
        {
            Dispatcher.Invoke(new Action(delegate { progress.Value = pct; }));
        }

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
        //  tiny widget factory
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
            t.FontFamily = new FontFamily("Segoe UI");
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
            b.FontFamily = new FontFamily("Segoe UI");
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
            b.FontFamily = new FontFamily("Segoe UI");
            b.Cursor = Cursors.Hand;
            b.Template = OutlineButtonTemplate();
            return b;
        }

        // filled orange button with hover
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

        // The official Monero symbol (getmonero.org press kit), rendered as vector paths.
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
            vb.Width = size; vb.Height = size;
            vb.Stretch = Stretch.Uniform;
            vb.Child = canvas;
            return vb;
        }

        static System.Windows.Shapes.Path MakePath(string data, Brush fill, Transform shift)
        {
            var p = new System.Windows.Shapes.Path();
            p.Data = Geometry.Parse(data);
            p.Fill = fill;
            p.RenderTransform = shift;
            return p;
        }
    }
}
