"""The dashboard's card image: an inline SVG, as a data URI.

girder-dashboards draws a card per dashboard, and falls back to a Fontello
glyph when the document carries no ``image`` -- which is what the cog was. The
image is inlined rather than served from ``web_client/dist`` so the card needs
no static-asset plumbing and survives an admin pointing ``image`` somewhere
else and then resetting to defaults. Both girder-dashboards' own *Data
Overview* and the Porosity Modeling dashboard do the same.

What it draws is what this plugin is for: a plate carrying an array of flyer
discs, each ringed in the colour of the laser setting assigned to it, with two
ghost outlines behind it for the layers of the stack and a beam striking one
disc. The struck disc is the one the colour cycle would have coloured
``#6cc5f0``; it is drawn hot instead.

The card is ``object-fit: cover`` in a 150px-tall box at least 280px wide, so
the wider the card the more of the top and bottom is cropped -- at 380px the
visible band is roughly y 27..153 of the 180-unit viewBox. Everything that has
to read stays inside it; the grid, the beam's origin and the scale bar below
the plate are all deliberately expendable.
"""

import base64

CARD_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
  <defs>
    <linearGradient id="fbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2a4463"/>
      <stop offset="100%" stop-color="#111f2f"/>
    </linearGradient>
    <linearGradient id="fbeam" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe6a3"/>
      <stop offset="100%" stop-color="#ff7a45"/>
    </linearGradient>
    <radialGradient id="fspot">
      <stop offset="0%" stop-color="#fff3d0" stop-opacity="0.95"/>
      <stop offset="45%" stop-color="#ffb457" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#ff7a45" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="320" height="180" fill="url(#fbg)"/>
  <g stroke="#6f97c0" stroke-width="1" opacity="0.16">
    <line x1="0" y1="45" x2="320" y2="45"/>
    <line x1="0" y1="90" x2="320" y2="90"/>
    <line x1="0" y1="135" x2="320" y2="135"/>
    <line x1="80" y1="0" x2="80" y2="180"/>
    <line x1="160" y1="0" x2="160" y2="180"/>
    <line x1="240" y1="0" x2="240" y2="180"/>
  </g>
  <g fill="none" stroke="#7ea6cd" stroke-width="1.5">
    <rect x="16" y="26" width="196" height="104" rx="9" opacity="0.15"/>
    <rect x="23" y="33" width="196" height="104" rx="9" opacity="0.28"/>
  </g>
  <rect x="30" y="40" width="196" height="104" rx="9" fill="#12243a" stroke="#7ea6cd" stroke-width="1.5"/>
  <g>
    <circle cx="56" cy="62" r="11" fill="#16293c" stroke="#ff6b5b" stroke-width="2.5"/>
    <circle cx="56" cy="62" r="5" fill="#ff6b5b" opacity="0.35"/>
    <circle cx="104" cy="62" r="11" fill="#16293c" stroke="#ffc857" stroke-width="2.5"/>
    <circle cx="104" cy="62" r="5" fill="#ffc857" opacity="0.35"/>
    <circle cx="152" cy="62" r="11" fill="#16293c" stroke="#6fd3a8" stroke-width="2.5"/>
    <circle cx="152" cy="62" r="5" fill="#6fd3a8" opacity="0.35"/>
    <circle cx="56" cy="92" r="11" fill="#16293c" stroke="#ff6b5b" stroke-width="2.5"/>
    <circle cx="56" cy="92" r="5" fill="#ff6b5b" opacity="0.35"/>
    <circle cx="104" cy="92" r="11" fill="#16293c" stroke="#ffc857" stroke-width="2.5"/>
    <circle cx="104" cy="92" r="5" fill="#ffc857" opacity="0.35"/>
    <circle cx="152" cy="92" r="11" fill="#16293c" stroke="#6fd3a8" stroke-width="2.5"/>
    <circle cx="152" cy="92" r="5" fill="#6fd3a8" opacity="0.35"/>
    <circle cx="200" cy="92" r="11" fill="#16293c" stroke="#6cc5f0" stroke-width="2.5"/>
    <circle cx="200" cy="92" r="5" fill="#6cc5f0" opacity="0.35"/>
    <circle cx="56" cy="122" r="11" fill="#16293c" stroke="#ff6b5b" stroke-width="2.5"/>
    <circle cx="56" cy="122" r="5" fill="#ff6b5b" opacity="0.35"/>
    <circle cx="104" cy="122" r="11" fill="#16293c" stroke="#ffc857" stroke-width="2.5"/>
    <circle cx="104" cy="122" r="5" fill="#ffc857" opacity="0.35"/>
    <circle cx="152" cy="122" r="11" fill="#16293c" stroke="#6fd3a8" stroke-width="2.5"/>
    <circle cx="152" cy="122" r="5" fill="#6fd3a8" opacity="0.35"/>
    <circle cx="200" cy="122" r="11" fill="#16293c" stroke="#6cc5f0" stroke-width="2.5"/>
    <circle cx="200" cy="122" r="5" fill="#6cc5f0" opacity="0.35"/>
  </g>
  <line x1="306" y1="-6" x2="200" y2="62" stroke="url(#fbeam)" stroke-width="13" opacity="0.2" stroke-linecap="round"/>
  <line x1="306" y1="-6" x2="200" y2="62" stroke="url(#fbeam)" stroke-width="3" stroke-linecap="round"/>
  <circle cx="200" cy="62" r="22" fill="url(#fspot)"/>
  <circle cx="200" cy="62" r="11" fill="#2a1c15" stroke="#fff0c4" stroke-width="3"/>
  <circle cx="200" cy="62" r="5" fill="#ffd27a"/>
  <g stroke="#ffd27a" stroke-width="2" stroke-linecap="round" opacity="0.85">
    <line x1="200" y1="43" x2="200" y2="37"/>
    <line x1="184" y1="52" x2="179" y2="49"/>
    <line x1="184" y1="72" x2="179" y2="75"/>
    <line x1="200" y1="81" x2="200" y2="87"/>
    <line x1="216" y1="72" x2="221" y2="75"/>
  </g>
  <g stroke="#9dc0e0" stroke-width="1.5" stroke-linecap="round" opacity="0.4">
    <line x1="30" y1="156" x2="226" y2="156"/>
    <line x1="30" y1="151" x2="30" y2="161"/>
    <line x1="128" y1="152" x2="128" y2="160"/>
    <line x1="226" y1="151" x2="226" y2="161"/>
  </g>
</svg>"""


def cardImage():
    """`CARD_SVG` as a base64 data URI, which is what the card's `img` src holds."""
    encoded = base64.b64encode(CARD_SVG.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"
