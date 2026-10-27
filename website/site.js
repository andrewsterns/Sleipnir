// Points the download buttons straight at the latest GitHub Release's
// installers (the same feed the in-app updater reads — see RELEASING.md).
// Without JS, or if the API is rate-limited, the buttons keep their
// fallback href: the Releases page itself.
//
// CHECKOUT_URL: the Lemon Squeezy checkout link for the Founder license —
// keep in sync with electron/licenseConfig.cjs.
const REPO = 'andrewsterns/Sleipnir'
const CHECKOUT_URL = '' // e.g. https://sleipnir.lemonsqueezy.com/buy/…

function pickAssets(assets) {
  const find = (re) => assets.find((a) => re.test(a.name) && !/\.blockmap$/i.test(a.name))
  return {
    win: find(/\.exe$/i),
    mac: find(/arm64\.dmg$/i) || find(/\.dmg$/i),
    linux: find(/\.AppImage$/i),
  }
}

async function wireDownloads() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return
    const release = await res.json()
    const picked = pickAssets(release.assets || [])
    for (const el of document.querySelectorAll('[data-download]')) {
      const asset = picked[el.dataset.download]
      if (asset) {
        el.href = asset.browser_download_url
        el.hidden = false
      } else if (el.dataset.download !== 'win') {
        el.hidden = true
      }
    }
    const version = document.querySelector('[data-version]')
    if (version && release.tag_name) version.textContent = release.tag_name
  } catch {
    // Offline or blocked — the Releases page fallback still works.
  }
}

// Until the store is live, Buy says so rather than linking nowhere.
function wireCheckout() {
  for (const el of document.querySelectorAll('[data-buy]')) {
    if (CHECKOUT_URL) {
      el.href = CHECKOUT_URL
    } else {
      el.removeAttribute('href')
      el.setAttribute('aria-disabled', 'true')
      el.textContent = 'Founder licenses open soon'
    }
  }
}

document.getElementById('year').textContent = String(new Date().getFullYear())
wireCheckout()
wireDownloads()
