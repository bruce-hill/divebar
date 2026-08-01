// Media player widget (MPRIS via the backend; divebar://media events).
// Shows album art (or a note icon) + title/artist. Click toggles
// play/pause, middle click skips to the next track. Hides itself when no
// player is running.

const NOTE_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 18 V6 L19 4 V16"/>
    <circle cx="6.6" cy="18" r="2.4"/>
    <circle cx="16.6" cy="16" r="2.4"/>
  </svg>
`;

export default {
  name: "media",
  css: `
    .widget-media { display: none; cursor: pointer; }
    .widget-media.present { display: flex; }
    .widget-media .art {
      display: none;
      width: calc(var(--chip-height) * 0.68);
      height: calc(var(--chip-height) * 0.68);
      border-radius: 5px;
      object-fit: cover;
    }
    .widget-media .track {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      -webkit-mask-image: linear-gradient(to right, black calc(100% - 20px), transparent);
      mask-image: linear-gradient(to right, black calc(100% - 20px), transparent);
    }
    .widget-media .artist { color: var(--bar-fg-dim); }
    .widget-media.paused .icon,
    .widget-media.paused .track { opacity: 0.55; }
  `,
  settings: [
    {
      key: "maxWidth",
      label: "Max text width (ch)",
      type: "number",
      min: 8,
      max: 60,
      default: 24,
    },
    {
      key: "showArtist",
      label: "Show artist",
      type: "boolean",
      default: true,
    },
  ],
  create({ options, onEvent, invoke }) {
    const el = document.createElement("div");
    el.className = "chip clickable widget-media";
    el.innerHTML = `
      <span class="icon">${NOTE_SVG}</span>
      <img class="art" alt=""/>
      <span class="track"></span>
    `;
    const iconEl = el.querySelector(".icon");
    const artEl = el.querySelector(".art");
    const trackEl = el.querySelector(".track");
    trackEl.style.maxWidth = `${options.maxWidth}ch`;

    function control(action) {
      invoke("media_control", { action }).catch((err) =>
        console.error("divebar: media_control failed", err),
      );
    }
    el.addEventListener("click", () => control("playPause"));
    el.addEventListener("auxclick", (e) => {
      if (e.button === 1) control("next");
    });

    const unsubscribe = onEvent("divebar://media", (media) => {
      const present = media && (media.title || media.artist);
      el.classList.toggle("present", Boolean(present));
      if (!present) return;

      el.classList.toggle("paused", media.status !== "Playing");

      trackEl.replaceChildren();
      trackEl.append(document.createTextNode(media.title || "Unknown"));
      if (options.showArtist && media.artist) {
        const artist = document.createElement("span");
        artist.className = "artist";
        artist.textContent = ` — ${media.artist}`;
        trackEl.append(artist);
      }

      if (media.art) {
        if (artEl.src !== media.art) artEl.src = media.art;
        artEl.style.display = "block";
        iconEl.style.display = "none";
      } else {
        artEl.style.display = "none";
        iconEl.style.display = "";
      }

      el.title =
        `${media.title || "Unknown"}${media.artist ? ` — ${media.artist}` : ""}` +
        ` (${media.status}, ${media.player}) · click to play/pause, middle-click for next`;
    });

    return { el, destroy: unsubscribe };
  },
};
