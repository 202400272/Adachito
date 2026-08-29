from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
DIST = ROOT / "dist"
ASSETS = ROOT / "assets"
REPORT_DIR = ROOT / ".qa"

CRITICAL_ROUTES = ["/", "/Adashima_Novelas", "/Adashima_Manga", "/Adashima_Music", "/Adashima_Gallery"]

VISUAL_ROUTES = CRITICAL_ROUTES

ROUTES = [
    "/", "/Adashima_About", "/Adashima_Help", "/Adashima_Anime",
    "/Adashima_Drama", "/Adashima_Estrella", "/Adashima_Extra_Stories",
    "/Adashima_Gallery", "/Adashima_Linea", "/Adashima_Manga",
    "/Adashima_Music", "/Adashima_Novelas", "/Adashima_Otros",
    "/Adashima_Stats", "/Juego", "/otros/Author_Archive",
]

# Each workflow has a human-friendly name and only uses controls that are known
# to exist in the current AdashimaVerse project. Missing optional controls are
# reported as "Skipped" rather than causing a false failure.
SEARCHES = [
    ("Gallery search", "/Adashima_Gallery", "#gallerySearch"),
    ("Extra Stories search", "/Adashima_Extra_Stories", "#searchInput"),
    ("Anime search", "/Adashima_Anime", "#guideSearchInput"),
    ("Help search", "/Adashima_Help", "#helpSearch"),
    ("Novel search", "/Adashima_Novelas", "#searchInput"),
    ("Manga search", "/Adashima_Manga", "#searchInput"),
    ("Author archive search", "/otros/Author_Archive", "#archiveSearch"),
]

FRIENDLY = {
    "Build": ("Getting the site ready", "Makes sure the production version can be built."),
    "Data": ("Content", "Checks that the site's content files are readable and consistent."),
    "Pages": ("Pages", "Makes sure important pages still exist."),
    "Links": ("Links & files", "Checks that buttons, links, images, and other local files point somewhere real."),
    "Browser": ("Using the site", "Opens the real production preview and uses the site like a visitor."),
    "Speed": ("Speed", "Checks whether the homepage loads within the basic speed targets."),
    "Accessibility": ("Ease of use", "Looks for common problems that can make the site harder to use."),
    "JavaScript": ("Code health", "Checks JavaScript for obvious syntax errors."),
    "Preview": ("Preview server", "Starts the production-style preview used for browser tests."),
    "Music": ("Music player", "Checks the music library, playback, search, favorites, queue, and player controls."),
    "Visual": ("Visual changes", "Compares important pages against approved screenshots."),
    "Intelligence": ("Content intelligence", "Checks translation parity, schema health, and duplicate content."),
    "Structure": ("Site structure", "Finds generated pages that are not linked from the site."),
    "Regression": ("Changes since last run", "Highlights problems that appeared or got worse compared with a saved baseline."),
}
