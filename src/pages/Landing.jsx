import React from "react";
import { Link } from "react-router-dom";
import {
  FileText,
  Edit3,
  Scissors,
  Merge,
  ScanLine,
  Zap,
  Lock,
  Unlock,
  ChevronRight,
  Check,
  X,
  PenTool,
  RotateCcw,
  FileDown,
  EyeOff,
  Droplets,
  FileSearch,
  Layers,
  Sparkles,
  Archive,
  ShieldCheck,
  WifiOff,
  ArrowRight,
} from "lucide-react";
import Navbar from "../components/layout/Navbar.jsx";
import GithubIcon from "../components/ui/GithubIcon.jsx";
import styles from "./Landing.module.css";

const FEATURES = [
  {
    icon: Edit3,
    label: "Edit PDF text",
    color: "#e84545",
    desc: "Click any text in a PDF and edit it in place, with automatic font detection, size, and color control.",
    tag: "Killer feature",
  },
  {
    icon: ScanLine,
    label: "OCR Scanner",
    color: "#10b981",
    desc: "Turn scanned PDFs into an editable Markdown document with a local Ollama model and GLM-powered formatting.",
    tag: "New",
  },
  {
    icon: Merge,
    label: "Merge PDFs",
    color: "#3b82f6",
    desc: "Combine multiple PDFs with full page-order control.",
  },
  {
    icon: Scissors,
    label: "Split PDF",
    color: "#e84545",
    desc: "Split by page ranges or every N pages.",
  },
  {
    icon: FileSearch,
    label: "Extract pages",
    color: "#f59e0b",
    desc: "Pull specific pages into a brand-new file.",
  },
  {
    icon: Layers,
    label: "Reorder pages",
    color: "#8b5cf6",
    desc: "Drag and drop pages into the right order, visually.",
  },
  {
    icon: RotateCcw,
    label: "Rotate PDF",
    color: "#8b5cf6",
    desc: "Rotate pages 90°, 180°, or 270° in one click.",
  },
  {
    icon: FileDown,
    label: "Compress PDF",
    color: "#f59e0b",
    desc: "Iterative visual compression that hits your target file size.",
  },
  {
    icon: Droplets,
    label: "Watermark",
    color: "#06b6d4",
    desc: "Text or image watermarks with live preview and page targeting.",
  },
  {
    icon: Lock,
    label: "Protect PDF",
    color: "#e84545",
    desc: "Add password encryption before sharing.",
  },
  {
    icon: Unlock,
    label: "Unlock PDF",
    color: "#10b981",
    desc: "Remove copy and print restrictions from your own files.",
  },
  {
    icon: EyeOff,
    label: "Redact PDF",
    color: "#a0a0ac",
    desc: "Black out sensitive content before it leaves your machine.",
  },
];

const OCR_STEPS = [
  {
    icon: ScanLine,
    title: "Recognize locally",
    desc: "Each page is rendered and read by glm-ocr on your own Ollama server. No image ever leaves your machine.",
  },
  {
    icon: Sparkles,
    title: "Format with GLM",
    desc: "Raw text becomes structured Markdown: headings, lists, and page boundaries, with retry-safe formatting.",
  },
  {
    icon: Archive,
    title: "Edit and archive",
    desc: "Fix anything in the built-in Markdown editor. Documents are archived in your browser with auto-generated Spanish titles.",
  },
];

const COMPARE = [
  {
    feature: "Edit existing PDF text",
    zero: true,
    stirling: "limited",
    cloud: "paid",
  },
  {
    feature: "OCR to editable Markdown",
    zero: true,
    stirling: "basic OCR output",
    cloud: "paid",
  },
  {
    feature: "Zero install — runs in the browser",
    zero: true,
    stirling: "needs Docker / a server",
    cloud: true,
  },
  {
    feature: "Files never uploaded",
    zero: true,
    stirling: "if you host it yourself",
    cloud: "cloud upload",
  },
  {
    feature: "No account, no task limits",
    zero: true,
    stirling: true,
    cloud: "free plan caps",
  },
  {
    feature: "Works offline",
    zero: true,
    stirling: true,
    cloud: false,
  },
  {
    feature: "Open source",
    zero: true,
    stirling: true,
    cloud: false,
  },
];

function Cell({ val }) {
  if (val === true)
    return (
      <span className={styles.yes}>
        <Check size={14} />
      </span>
    );
  if (val === false)
    return (
      <span className={styles.no}>
        <X size={14} />
      </span>
    );
  return <span className={styles.partial}>{val}</span>;
}

const GITHUB_URL = "https://github.com/zademy/PdfZero";

export default function Landing() {
  return (
    <div className={styles.page}>
      <Navbar variant="landing" />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroEyebrow}>
            <ShieldCheck size={12} /> Open source · MIT · No backend, ever
          </div>
          <h1 className={styles.heroTitle}>
            Every PDF tool.
            <br />
            <span className={styles.heroAccent}>Zero everything else.</span>
          </h1>
          <p className={styles.heroSub}>
            PDFZero is the full toolkit — text editing, OCR to Markdown, merge,
            split, watermark, encrypt — running{" "}
            <em>entirely in your browser</em>. No uploads, no accounts, no
            paywalls.
          </p>
          <div className={styles.heroActions}>
            <Link to="/editor" className={styles.primaryBtn}>
              <Zap size={16} />
              Start editing free
              <ChevronRight size={14} />
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.ghostBtn}
            >
              <GithubIcon size={15} />
              Star on GitHub
            </a>
          </div>
          <div className={styles.heroPills}>
            <span className={styles.pill}>
              <Check size={11} /> No sign-up
            </span>
            <span className={styles.pill}>
              <Check size={11} /> No file size limit
            </span>
            <span className={styles.pill}>
              <Check size={11} /> No task limits
            </span>
            <span className={styles.pill}>
              <WifiOff size={11} /> Works offline
            </span>
            <span className={styles.pillAccent}>
              <Lock size={11} /> Files never uploaded
            </span>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.pipelineCard}>
            <div className={styles.pipelineBar}>
              <div className={styles.previewDots}>
                <span />
                <span />
                <span />
              </div>
              <span className={styles.previewTitle}>
                OCR Scanner — local pipeline
              </span>
              <span className={styles.pipelineLive}>
                <span className={styles.liveDot} />
                live
              </span>
            </div>
            <div className={styles.pipelineBody}>
              <div className={styles.pipePage}>
                <div className={styles.pipeScanline} />
                <div
                  className={`${styles.pipeLine} ${styles.pipeHit}`}
                  style={{ width: "78%", animationDelay: "0s" }}
                />
                <div className={styles.pipeLine} style={{ width: "92%" }} />
                <div
                  className={`${styles.pipeLine} ${styles.pipeHit}`}
                  style={{ width: "64%", animationDelay: "0.5s" }}
                />
                <div className={styles.pipeLine} style={{ width: "88%" }} />
                <div
                  className={`${styles.pipeLine} ${styles.pipeHit}`}
                  style={{ width: "48%", animationDelay: "1s" }}
                />
                <div className={styles.pipeLine} style={{ width: "70%" }} />
                <div
                  className={`${styles.pipeLine} ${styles.pipeHit}`}
                  style={{ width: "56%", animationDelay: "1.5s" }}
                />
                <div className={styles.pipeLine} style={{ width: "34%" }} />
              </div>

              <div className={styles.pipeArrow}>
                <ArrowRight size={16} />
                <div className={styles.pipeDots}>
                  <span style={{ animationDelay: "0s" }} />
                  <span style={{ animationDelay: "0.2s" }} />
                  <span style={{ animationDelay: "0.4s" }} />
                </div>
              </div>

              <div className={styles.pipeOut}>
                <span
                  className={`${styles.outLine} ${styles.outHead}`}
                  style={{ animationDelay: "0.2s" }}
                >
                  # Annual Report
                </span>
                <span
                  className={`${styles.outLine} ${styles.outQuote}`}
                  style={{ animationDelay: "0.5s" }}
                >
                  &gt; FY26 consolidated results
                </span>
                <span
                  className={styles.outLine}
                  style={{ animationDelay: "0.8s" }}
                >
                  Revenue: $4.2M (+18%)
                </span>
                <span
                  className={styles.outLine}
                  style={{ animationDelay: "1.1s" }}
                >
                  Profit: $840K (+9%)
                </span>
                <span
                  className={`${styles.outLine} ${styles.outLi}`}
                  style={{ animationDelay: "1.4s" }}
                >
                  Outlook: two new hubs
                </span>
              </div>
            </div>
            <div className={styles.pipelineStatus}>
              <span className={styles.chip} style={{ animationDelay: "0s" }}>
                <ScanLine size={10} /> Recognizing
              </span>
              <span className={styles.chip} style={{ animationDelay: "2s" }}>
                <Sparkles size={10} /> Formatting
              </span>
              <span className={styles.chip} style={{ animationDelay: "4s" }}>
                <Check size={10} /> Archived
              </span>
            </div>
            <div className={styles.floatBadge}>
              <Lock size={13} />
              Runs 100% on-device
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>The toolkit</div>
          <h2 className={styles.sectionTitle}>Twelve tools. One page.</h2>
          <p className={styles.sectionSub}>
            Everything runs client-side with pdf.js and pdf-lib. Open a file,
            use any tool, download the result.
          </p>
          <div className={styles.featureGrid}>
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.label} className={styles.featureCard}>
                  <div
                    className={styles.featureIconWrap}
                    style={{ color: f.color, background: `${f.color}1a` }}
                  >
                    <Icon size={20} />
                  </div>
                  <div className={styles.featureLabel}>
                    {f.label}
                    {f.tag && (
                      <span className={styles.featureTag}>{f.tag}</span>
                    )}
                  </div>
                  <div className={styles.featureDesc}>{f.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.ocrSection}>
        <div className={styles.ocrInner}>
          <div className={styles.ocrCopy}>
            <div className={styles.sectionLabel}>OCR Scanner</div>
            <h2 className={styles.sectionTitle}>
              Scanned PDFs become
              <br />
              living Markdown
            </h2>
            <p className={styles.ocrSub}>
              The scanner is a full document workspace: it recognizes, formats,
              and archives — and every step happens on your machine.
            </p>
            <div className={styles.ocrSteps}>
              {OCR_STEPS.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.title} className={styles.ocrStep}>
                    <div className={styles.ocrStepIcon}>
                      <Icon size={15} />
                    </div>
                    <div>
                      <div className={styles.ocrStepTitle}>{s.title}</div>
                      <div className={styles.ocrStepDesc}>{s.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.ocrVisual}>
            <div className={styles.ocrWindow}>
              <div className={styles.ocrBar}>
                <div className={styles.previewDots}>
                  <span />
                  <span />
                  <span />
                </div>
                <span className={styles.previewTitle}>
                  OCR document — Markdown editor
                </span>
                <span className={styles.ocrBadgeDone}>
                  <Check size={10} /> 3 pages
                </span>
              </div>
              <div className={styles.ocrBody}>
                <div className={styles.ocrDoc}>
                  <div className={styles.mdHeading}># Annual Report 2026</div>
                  <div className={styles.mdQuote}>
                    &gt; Consolidated results across all four operating regions.
                  </div>
                  <div className={styles.mdText}>
                    Revenue grew 18% year over year, driven by commercial
                    expansion and the retention of key accounts across every
                    region.
                  </div>
                  <div className={styles.mdListItem}>Revenue: $4.2M (+18%)</div>
                  <div className={styles.mdListItem}>Profit: $840K (+9%)</div>
                  <div className={styles.mdHeading2}>## Outlook</div>
                  <div className={styles.mdText}>
                    Two new distribution centers are planned for the next fiscal
                    year…
                  </div>
                </div>
                <div className={styles.ocrArchive}>
                  <div className={styles.archiveTitle}>
                    <Archive size={11} /> Archive
                  </div>
                  {[
                    "Annual Report 2026",
                    "Contract — Draft",
                    "Invoices Q1",
                  ].map((t, i) => (
                    <div
                      key={t}
                      className={`${styles.archiveItem} ${i === 0 ? styles.archiveActive : ""}`}
                    >
                      <FileText size={11} />
                      <span>{t}</span>
                    </div>
                  ))}
                  <div className={styles.archiveMeta}>
                    Stored in your browser
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.ocrTagRow}>
              <span className={styles.ocrTag}>.md export</span>
              <span className={styles.ocrTag}>.txt export</span>
              <span className={styles.ocrTag}>Spanish auto-titles</span>
              <span className={styles.ocrTag}>IndexedDB archive</span>
            </div>
          </div>
        </div>
      </section>

      <section
        className={styles.section}
        style={{ background: "var(--bg-nav)" }}
      >
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>Comparison</div>
          <h2 className={styles.sectionTitle}>How PDFZero compares</h2>
          <div className={styles.tableWrap}>
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th className={styles.thZero}>
                    <div className={styles.thBadge}>PDFZero</div>
                    <div className={styles.thPrice}>Free, forever</div>
                  </th>
                  <th>
                    <div>Stirling PDF</div>
                    <div className={styles.thPrice}>
                      Open source, self-hosted
                    </div>
                  </th>
                  <th>
                    <div>Smallpdf / iLovePDF</div>
                    <div className={styles.thPrice}>Freemium, cloud</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.feature}>
                    <td>{row.feature}</td>
                    <td className={styles.tdZero}>
                      <Cell val={row.zero} />
                    </td>
                    <td>
                      <Cell val={row.stirling} />
                    </td>
                    <td>
                      <Cell val={row.cloud} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>Privacy first</div>
          <h2 className={styles.sectionTitle}>
            Your files never leave your device
          </h2>
          <div className={styles.howGrid}>
            <div className={styles.howCard}>
              <div className={styles.howNum}>01</div>
              <div className={styles.howTitle}>Open your PDF</div>
              <div className={styles.howDesc}>
                Drag and drop or click to browse. The file loads directly into
                browser memory.
              </div>
            </div>
            <div className={styles.howCard}>
              <div className={styles.howNum}>02</div>
              <div className={styles.howTitle}>Edit everything</div>
              <div className={styles.howDesc}>
                pdf.js and pdf-lib run locally in your browser, powered by
                WebAssembly. Zero network requests.
              </div>
            </div>
            <div className={styles.howCard}>
              <div className={styles.howNum}>03</div>
              <div className={styles.howTitle}>Download instantly</div>
              <div className={styles.howDesc}>
                The edited PDF is generated in-browser and saved directly. No
                cloud, no server, no tracking.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>Zero between you and your PDF</h2>
          <p className={styles.ctaSub}>
            No account. No credit card. No upload. Just open a file and get to
            work.
          </p>
          <div className={styles.ctaActions}>
            <Link
              to="/editor"
              className={styles.primaryBtn}
              style={{ fontSize: 15, padding: "12px 28px" }}
            >
              <Zap size={16} />
              Open the editor
            </Link>
            <Link to="/tools" className={styles.ghostBtn}>
              <PenTool size={14} />
              Browse all tools
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <div className={styles.footerLogo}>
              <div className={styles.footerLogoMark}>
                <FileText size={14} />
              </div>
              <span>PDFZero</span>
            </div>
            <div className={styles.footerTagline}>
              The zero-upload PDF toolkit.
            </div>
          </div>
          <div className={styles.footerLinks}>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <Link to="/tools">All Tools</Link>
            <Link to="/editor">Editor</Link>
            <a
              href={`${GITHUB_URL}/issues`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Report Bug
            </a>
          </div>
          <div className={styles.footerNote}>
            <span className={styles.forkBadge}>Maintained fork</span>
            PDFZero is an actively maintained fork of the original open-source
            project — this is the version that keeps moving forward.
            <span className={styles.footerTech}>
              MIT License · Built with pdf-lib, pdf.js, mdxeditor &amp; Ollama
              (glm-ocr) · No tracking, no analytics
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
