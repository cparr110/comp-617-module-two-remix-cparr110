# Baseline or Warning Light? Making Of (COMP 617 Module 2 Remix)

## Project
- **Author:** Clay Parr
- **Live deployment:** <https://cparr110.github.io/comp-617-module-two-remix-cparr110/>
- **Local entry file:** `index.html`

## Original Piece + Credits
- **Original story remixed:** Justin Lahart, Wall Street Journal, "Inflation Holds Steady, but Iran War Threatens to Boost Prices" (updated March 11, 2026).
- **Link:** <https://www.wsj.com/economy/cpi-inflation-report-february-2026-df32173e?st=pou3u9&reflink=desktopwebshare_permalink>

## Data Sources
- Federal Reserve Economic Data (FRED), St. Louis Fed.
- Underlying CPI series from the U.S. Bureau of Labor Statistics.
- Oil price series from the U.S. Energy Information Administration.

---

## Making Of: Design Process

### Why This Story
I chose the WSJ inflation piece because it makes a clear but narrow claim. It says February 2026 inflation looks calm, but could turn because of oil. I wanted to test whether the risk picture is really that simple. The article also focuses on a single monthly snapshot, which made it a good starting point for adding more time context and another explanation through visualization.

### Initial Concept and Sketching
My first step was to outline what the original article does well and where it leaves gaps:

- **What it does well:** Clearly explains the headline vs core CPI split and the Iran-oil risk channel.
- **Where it leaves gaps:** No historical trend context, no breakdown of which categories are actually driving pressure, and no consideration that services inflation might matter independently of oil.

From that gap analysis, I sketched four views on paper before writing any code:
1. A time-series trend to show that one month is not enough context.
2. A ranked bar chart to expose which categories carry the most weight in any given month.
3. A scatter plot to directly test the oil-to-energy inflation link the article emphasizes.
4. A comparison view to pit energy volatility against services stickiness as a counter-argument.

### Design Decisions

**Chart type choices:** I picked three different chart forms (line, diverging bar, scatter) so that each view does a different job. The line chart shows change over time, the bar chart shows ranking, and the scatter plot checks the oil relationship directly. The fourth chart uses another line chart because comparing energy and services over time works best on the same time axis.

**Color palette:** I kept the palette small. Red is used for headline and energy, blue is used for core and negative values, and green is used for services. I did not want a rainbow palette because it would make the charts harder to read.

**Interaction model:** Every chart has hover tooltips and click-to-select. When a reader clicks a month in any chart, all four charts update to that month. I did this so people could test the article's claim on more than just the one month the WSJ focused on.

**Sort toggle on the bar chart:** I added alphabetical and value-based sorting because they answer different questions. One helps a reader find the hottest categories. The other helps a reader find a specific category quickly.

**Visual restraint:** I kept the page simple. There are no hero images, animated transitions, or gradient backgrounds. The typography is plain and the cards are simple. I wanted the attention to stay on the data and interaction.

### Iteration
The first version had all four charts in a standard scrolling magazine layout. After building it, I realized the reader had no guidance about *when* to look at each chart relative to the argument. That motivated adding the scrollytelling walkthrough at the top, which stages the reading into four checkpoints. Each checkpoint changes the selected date and highlights the most relevant chart, giving the reader a guided path through the data before they explore on their own.

I also iterated on the counter-argument section. The first draft simply showed the two lines (energy vs services) without framing. I added the side-by-side claim cards ("Original Claim Lens" vs "Counter-Argument Lens") to make the rhetorical structure explicit, so a reader can see exactly which metrics back each position.

### Final Visual Structure
1. **Headline vs Core Trend (interactive D3 line chart):** hover/click month selection with tooltip.
2. **Category Pressure (interactive D3 diverging bars):** sort toggle + hover tooltips, dashed reference line for overall CPI.
3. **Oil vs Energy Link (interactive D3 scatter):** color-encoded by date, click to coordinate, Pearson correlation in footnote.
4. **Counter-Argument View (interactive D3 line chart):** energy CPI vs services-less-energy CPI with volatility comparison in footnote.

---

## Bells and Whistles Completed
1. **Live Deployment (1pt):** Published via GitHub Pages, with the link at the top of this document and in the story itself.
2. **View Coordination (2pts):** Clicking a month in any chart updates the selected date across all four charts and the stat chips. The scrollytelling steps also drive this shared state.
3. **New Technique (3pts):** Scrollytelling walkthrough with scroll-driven checkpoints. See the addendum below.
4. **Multiple Views / Counter-Argument (3pts):** Section 4 argues that sticky services inflation matters alongside oil risk, with side-by-side claim framing and a dedicated comparison chart. See the addendum below.

---

## Addendum: Effect of New Technique (Scrollytelling)

I changed the presentation from a static magazine-style layout, where charts appear inline like paper figures, to a **scrollytelling** model. In the scrollytelling section at the top of the page, four checkpoint cards sit on the left while a sticky summary panel stays visible on the right. As the reader scrolls or clicks through each checkpoint, the page updates the selected date, highlights the most relevant chart section, and refreshes the stat chips. A scroll-based trigger handles those updates automatically.

**How this changes reader engagement:**

- **Guided entry, then open exploration:** The scrollytelling section walks the reader through the argument in a controlled sequence (2021 surge → 2022 oil shock → 2024 uneven cooling → February 2026 baseline). This staging prevents information overload and ensures the reader understands the progression before diving into free exploration on the individual charts below.
- **Increased agency:** After the guided walkthrough, all four charts remain fully interactive. The reader can click any month they want and test the claims on their own terms. The scrollytelling acts as scaffolding, not a constraint.
- **Coordinated narrative pacing:** Because each scrollytelling step also drives the view coordination system, the reader sees the same month reflected across different chart types at the same time. For example, June 2022 shows both high oil and broad category pressure.

In a standard magazine layout, readers would encounter each visualization in isolation and have to mentally synchronize the data across charts. The scrollytelling model removes that cognitive overhead by doing the synchronization automatically, while still preserving the reader's ability to break away and explore independently.

## Addendum: Counter-Argument (Multiple Views)

The original WSJ article emphasizes oil as the main near-term inflation risk. This remix presents a counter-argument: **persistent services inflation can keep pressure elevated even when oil prices retreat.**

The counter-argument is supported by:
- **Section 4's side-by-side claim cards**, which state the original claim ("near-term inflation risk is mostly energy pass-through") and the counter-claim ("persistent services inflation can outlast energy spikes") in parallel.
- **The energy vs services comparison chart**, which shows that energy CPI swings wildly with oil prices but services-less-energy CPI has remained elevated and much less volatile since 2021. The footnote reports the standard deviation of each series to quantify this difference.
- **The category bar chart**, which (when set to February 2026) shows that several service-heavy categories, including shelter, medical care, and transportation services, remain above the overall CPI line even as energy has cooled.

The text in the story explicitly discusses this: "The risk story is broader than oil alone" and "services can sustain inflation pressure after the energy shock fades." The point is not that the WSJ is wrong about oil risk, but that a single-channel framing undersells the persistence embedded in services.

---

## AI Use Disclosure
OpenAI GPT-5 was used for overall help, D3 debugging, and copy editing. The story framing, data selection, and design decisions were done by Clay Parr.

## Run Locally
```bash
node scripts/build-data.mjs
python3 -m http.server 8000
```
Then open <http://localhost:8000>.
