/**
 * Demo content for `npm run db:seed`. Every publisher, place, club, company and person here is
 * fictional; source links use the reserved `.example` TLD so nothing poses as real reporting.
 */

export type Category = "world" | "tech" | "sports" | "business" | "science" | "culture";

export type DemoPublisher = {
  username: string;
  name: string;
  bio: string;
  category: Category;
};

/** Body building blocks → rendered to the same HTML the Tiptap composer produces. */
export type Block = { p: string } | { h2: string } | { ul: string[] } | { quote: string; by: string };

export type DemoArticle = {
  author: string;
  title: string;
  /** How long ago it was published, relative to the seed run. */
  hoursAgo: number;
  link?: string;
  shares: number;
  body: Block[];
};

export type DemoDraft = { author: string; title: string | null; body: Block[]; withCover: boolean };

export const DEMO_PASSWORD = "webnews-demo-2026";

export const DEMO_PUBLISHERS: DemoPublisher[] = [
  {
    username: "harbor.ledger",
    name: "Harbor Ledger",
    bio: "Dispatches from ports, capitals and borderlands.\nAn independent foreign desk.",
    category: "world",
  },
  {
    username: "circuit.desk",
    name: "Circuit Desk",
    bio: "Chips, code and the people who ship them. Plain-English tech reporting, no hype.",
    category: "tech",
  },
  {
    username: "final.whistle",
    name: "Final Whistle",
    bio: "Match reports, race days and the stories behind the scoreline.",
    category: "sports",
  },
  {
    username: "market.pulse",
    name: "Market Pulse",
    bio: "Markets, money and the small businesses that keep cities running.",
    category: "business",
  },
  {
    username: "field.notes",
    name: "Field Notes",
    bio: "Science from the lab bench to the ocean floor — explained without the jargon.",
    category: "science",
  },
  {
    username: "the.back.page",
    name: "The Back Page",
    bio: "Film, books, music and the city after dark.\nCulture desk.",
    category: "culture",
  },
];

export const DEMO_ARTICLES: DemoArticle[] = [
  /* ─────────────── World · Harbor Ledger ─────────────── */
  {
    author: "harbor.ledger",
    title: "Port Calder reopens its northern harbour after a six-week dredging standoff",
    hoursAgo: 0.2,
    link: "https://portcalder.example/harbour-authority/notice-114",
    shares: 38,
    body: [
      { p: "The first container ship in six weeks slipped into Port Calder’s northern harbour at dawn on Thursday, ending a standoff between the harbour authority and the dredging contractor that had left more than forty vessels waiting at anchor offshore." },
      { p: "Crowds gathered along the breakwater to watch the <em>Meridian Swift</em> berth, and dock workers — many of whom had been on reduced shifts since the channel was closed — greeted the crew with air horns." },
      { h2: "How the deal was done" },
      { p: "The agreement, published overnight by the <a href=\"https://portcalder.example/harbour-authority/notice-114\">harbour authority</a>, splits the cost of the overrun between the city and the contractor and adds penalties for any future delay." },
      { ul: ["Dredging of the final 400 metres resumes on Monday", "Night-time pilotage limited to vessels under 200 metres until then", "An independent engineer will sign off each stage of the work"] },
      { quote: "Nobody won this. The harbour lost six weeks, and the people who work on it paid for them.", by: "Ana Rook, secretary of the Calder dockers’ union" },
      { p: "Shipping agents said the backlog would take at least ten days to clear, and warned that some importers had already rerouted cargo to rival ports along the coast." },
    ],
  },
  {
    author: "harbor.ledger",
    title: "Flood barriers hold as the Veld Delta records its highest spring tide in 40 years",
    hoursAgo: 9,
    shares: 61,
    body: [
      { p: "The Veld Delta’s new tidal barriers faced their first real test overnight as a spring tide, pushed by a strong westerly wind, peaked 2.9 metres above the usual high-water mark — the highest reading since records began at the estuary gauge." },
      { p: "All eleven gates closed on schedule shortly after midnight. By morning, streets that flooded twice in the last decade were dry." },
      { h2: "A decade in the making" },
      { p: "The barrier scheme was approved after the winter floods ten years ago, when water reached the steps of the town hall in Lessing and more than two thousand homes were evacuated." },
      { ul: ["11 steel gates across three river mouths", "38 kilometres of raised embankment", "A control room staffed around the clock during storm season"] },
      { quote: "Last night was exactly the night we built it for. I didn’t sleep, but for once nobody else had to worry.", by: "Joris Maalen, barrier operations manager" },
      { p: "Engineers will inspect the gates over the coming days. Forecasters expect calmer conditions for the rest of the week, though another high tide is due before the end of the month." },
    ],
  },
  {
    author: "harbor.ledger",
    title: "The night train between Maren and Oskdal returns after a decade away",
    hoursAgo: 27,
    link: "https://railways.example/timetables/maren-oskdal-night",
    shares: 104,
    body: [
      { p: "For the first time in ten years, passengers boarded a sleeper train in Maren on Tuesday evening and woke up in Oskdal, 740 kilometres and one border away." },
      { p: "The route was cut when both national operators said it could no longer pay its way. Its revival is the result of a joint venture between the two railways and a regional fund that covers the rolling stock." },
      { h2: "What travellers can expect" },
      { ul: ["Departures three nights a week, rising to daily next summer", "Two-berth and four-berth cabins plus reclining seats", "Border checks on board, so nobody is woken at the frontier"] },
      { quote: "My grandmother took this train to see her sister every Christmas. I wanted to be on the first one back.", by: "Selin Aydar, a passenger in carriage four" },
      { p: "Tickets for the first month sold out within a day. Full timetables are on the <a href=\"https://railways.example/timetables/maren-oskdal-night\">joint operator’s site</a>; fares start at roughly the price of a budget flight, before baggage fees." },
    ],
  },
  {
    author: "harbor.ledger",
    title: "Seven island states sign a shared fisheries pact to protect collapsing tuna stocks",
    hoursAgo: 55,
    shares: 47,
    body: [
      { p: "Fisheries ministers from the seven states of the Corran Archipelago signed a joint agreement on Sunday that caps tuna catches across their combined waters and creates a single licence for foreign fleets." },
      { p: "Scientists advising the islands warned last year that yellowfin numbers had fallen to around a third of their level two decades ago." },
      { h2: "The main measures" },
      { ul: ["A shared annual catch limit, reviewed every two years", "Satellite tracking for every licensed vessel over 24 metres", "A three-month closed season during spawning"] },
      { quote: "Fish don’t stop at our borders. For thirty years we managed them as if they did.", by: "Teuila Marr, fisheries minister of the largest island" },
      { p: "Fishing crews have been promised a compensation fund for the closed season, but some local associations say the payments are too small and have called for a review before the first season begins." },
    ],
  },

  /* ─────────────── Tech · Circuit Desk ─────────────── */
  {
    author: "circuit.desk",
    title: "A 12-person startup just shipped the fastest open-source browser engine we’ve tested",
    hoursAgo: 0.8,
    link: "https://lumen-engine.example/blog/1-0",
    shares: 212,
    body: [
      { p: "Lumen, a browser engine written from scratch by a team of twelve, reached version 1.0 this morning — and in our tests it rendered heavy news pages faster than every mainstream engine we tried." },
      { p: "The project started four years ago as a weekend experiment. It now passes the vast majority of the standard web-platform tests and runs on laptops, phones and a handful of in-car screens." },
      { h2: "What we measured" },
      { ul: ["Time to first paint on ten image-heavy pages", "Memory use with fifty tabs open", "Battery drain while scrolling an infinite feed for an hour"] },
      { p: "Lumen won on first paint and memory, and tied on battery. It still struggles with some older sites that rely on quirks the engine deliberately doesn’t copy." },
      { quote: "We didn’t set out to beat anyone. We set out to understand how a browser works, and then kept going.", by: "Mira Castell, Lumen co-founder" },
      { p: "The team’s <a href=\"https://lumen-engine.example/blog/1-0\">release notes</a> list what is still missing, including full support for printing and some accessibility APIs." },
    ],
  },
  {
    author: "circuit.desk",
    title: "Northgate’s free public Wi-Fi mesh now covers 80% of the city — and cost less than planned",
    hoursAgo: 14,
    shares: 58,
    body: [
      { p: "Northgate’s public Wi-Fi network, built from thousands of small radios bolted to lamp posts, now covers four fifths of the city’s streets, the council said on Wednesday — two years ahead of schedule." },
      { p: "The network was pitched as a way to get households without broadband online. Take-up has been strongest in the districts where home connections are least common." },
      { h2: "Why it came in cheaper" },
      { ul: ["Lamp posts already had power, so no new cabling was needed", "Radios are made by a local co-operative rather than bought abroad", "Volunteers help with maintenance in exchange for training"] },
      { quote: "Half my students used to do homework in the library car park at night. Now they do it at home.", by: "Dev Okafor, a secondary-school teacher" },
      { p: "Privacy campaigners have welcomed the council’s decision not to require logins, but want an independent audit of what data the network collects. The council says an audit is planned for the spring." },
    ],
  },
  {
    author: "circuit.desk",
    title: "Why your next laptop battery might be solid-state — and why it still isn’t",
    hoursAgo: 33,
    shares: 76,
    body: [
      { p: "Solid-state batteries have been “two years away” for about a decade. This year, for the first time, small batches are going into real products — but only a few, and only at a price." },
      { p: "The idea is simple: replace the liquid inside today’s lithium-ion cells with a solid material. That should make batteries safer, faster to charge and able to store more energy in the same space." },
      { h2: "The hard parts" },
      { ul: ["Making the solid layer thin, even and crack-free at scale", "Keeping the cells stable over thousands of charge cycles", "Building factories when the chemistry keeps changing"] },
      { quote: "The lab results are real. The problem is that a lab makes ten cells and a factory has to make ten million identical ones.", by: "Priya Anand, battery researcher" },
      { p: "For now, the first solid-state packs are appearing in premium devices where cost matters less than weight. Mainstream laptops are more likely to see incremental improvements to existing cells for a few more years." },
    ],
  },
  {
    author: "circuit.desk",
    title: "Council bans facial recognition in public housing after a two-year residents’ campaign",
    hoursAgo: 62,
    shares: 133,
    body: [
      { p: "Residents of Northgate’s council estates won a two-year fight on Monday night when councillors voted to ban facial-recognition cameras from all public housing in the city." },
      { p: "The cameras had been installed at the entrances of three tower blocks as part of a pilot meant to reduce break-ins. Tenants said they were never asked and that the system regularly failed to recognise them." },
      { h2: "What the ban covers" },
      { ul: ["All buildings owned or managed by the council", "Contractors working on the council’s behalf", "Existing footage from the pilot, which must be deleted within 30 days"] },
      { quote: "We were treated as suspects in our own front doors. Tonight that ends.", by: "Hana Wills, chair of the tenants’ association" },
      { p: "The supplier said its system met all legal requirements. Several other councils are watching the decision closely as they review their own camera contracts." },
    ],
  },

  /* ─────────────── Sports · Final Whistle ─────────────── */
  {
    author: "final.whistle",
    title: "Harbour City score three in 18 minutes to overturn a two-goal deficit and stay top",
    hoursAgo: 2.5,
    shares: 89,
    body: [
      { p: "For seventy minutes it looked like Harbour City’s unbeaten run was over. Two goals down at home to Ridgeway, booed off at half-time, they needed something extraordinary. They found it." },
      { p: "Substitute winger Tomás Reyna changed the game within a minute of coming on, crossing for the captain to head in. Two more goals followed before Ridgeway could regroup." },
      { h2: "How the comeback unfolded" },
      { ul: ["72′ — Okoro header from Reyna’s cross (1–2)", "81′ — Reyna curls in from the edge of the box (2–2)", "90′ — Lindqvist bundles in a corner (3–2)"] },
      { quote: "At half-time I told them the crowd wasn’t booing them, it was booing the scoreline. Change the scoreline.", by: "Harbour City head coach Elin Varr" },
      { p: "The win keeps City two points clear at the top of the Coastal League with six games to play. Ridgeway, who led the table in the autumn, drop to fourth." },
    ],
  },
  {
    author: "final.whistle",
    title: "At 41, Ines Varga wins the Coastal Marathon on the streets where she learned to run",
    hoursAgo: 17,
    link: "https://coastalmarathon.example/results",
    shares: 145,
    body: [
      { p: "Ines Varga crossed the line on the seafront promenade in 2 hours 27 minutes on Sunday, becoming the oldest winner in the Coastal Marathon’s history — on the same streets where she ran her first race as a teenager." },
      { p: "Varga, a physiotherapist who trains before her morning shifts, broke clear of the leading group at the 35-kilometre mark and was never caught." },
      { h2: "Race in numbers" },
      { ul: ["14,200 finishers, a record for the event", "Winning margin: 48 seconds", "Temperature at the start: 9°C with a light tailwind"] },
      { quote: "At 35k my legs asked me what I was doing. I told them we’d discuss it at the finish.", by: "Ines Varga" },
      { p: "Organisers said this year’s course changes, which moved the final kilometres onto the promenade, had drawn the biggest crowds the race has seen. Full <a href=\"https://coastalmarathon.example/results\">results</a> are online." },
    ],
  },
  {
    author: "final.whistle",
    title: "The Women’s Coastal League breaks its attendance record for the third week running",
    hoursAgo: 38,
    shares: 71,
    body: [
      { p: "More than 21,000 people watched the weekend’s six fixtures in the Women’s Coastal League, beating the record set the previous weekend — which had itself beaten the one set the week before." },
      { p: "Clubs credit a mix of cheaper tickets, Sunday afternoon kick-offs and a title race that could go to the final day." },
      { h2: "What’s driving the crowds" },
      { ul: ["Season tickets for under-16s capped at the price of a cinema trip", "Matches moved into the main stadiums instead of training grounds", "Free live streams for every game, which clubs say bring new fans to the ground"] },
      { quote: "Three years ago we played in front of a few hundred people. On Sunday I couldn’t hear my own goalkeeper.", by: "Harbour City defender Amara Diallo" },
      { p: "League officials say they will review stadium allocations for next season, with at least two clubs asking to move every home game to their larger grounds." },
    ],
  },
  {
    author: "final.whistle",
    title: "Cycling’s new mountain stage is so steep that teams are changing their gearing",
    hoursAgo: 68,
    shares: 52,
    body: [
      { p: "When organisers of the Tour of the Ridges unveiled this year’s route, one climb stood out: the Col de Sarn, a narrow road with a final kilometre averaging nearly 17 per cent." },
      { p: "Mechanics say several teams are fitting gearing usually seen on gravel bikes, and at least one squad has sent riders to train on the climb twice this spring." },
      { h2: "Why it matters" },
      { ul: ["The stage comes two days before the final time trial", "The road is too narrow for team cars on the last three kilometres", "Descending riders will share the road with the race convoy on the way down"] },
      { quote: "On a climb like that, you don’t attack. You survive, and hope everyone else is surviving a little bit worse.", by: "Directeur sportif Paulo Menz" },
      { p: "Safety campaigners have asked for barriers on the upper slopes, where crowds are expected to be several people deep. Organisers say a full plan will be published next month." },
    ],
  },

  /* ─────────────── Business · Market Pulse ─────────────── */
  {
    author: "market.pulse",
    title: "Independent bookshops post their best quarter in a decade as readers return to the high street",
    hoursAgo: 4,
    link: "https://booksellers.example/reports/q3",
    shares: 96,
    body: [
      { p: "Independent bookshops had their strongest summer quarter in ten years, according to figures from the booksellers’ association, with sales up 14 per cent on last year and a net gain of 23 new shops." },
      { p: "Owners point to events, book clubs and in-store cafés as the reason people come in — and to recommendations that algorithms can’t quite match." },
      { h2: "Behind the numbers" },
      { ul: ["Children’s books were the fastest-growing category", "Average spend per visit rose slightly despite tight budgets", "Most new shops opened in smaller towns rather than cities"] },
      { quote: "People don’t come in for a product. They come in for a conversation and leave with three books they didn’t know they wanted.", by: "Rosa Pym, owner of a bookshop in Lessing" },
      { p: "The association’s <a href=\"https://booksellers.example/reports/q3\">full report</a> warns that rising rents remain the biggest threat, and calls for business-rate relief for shops on struggling high streets." },
    ],
  },
  {
    author: "market.pulse",
    title: "Regional grocer Fennick’s bets on four-hour delivery windows to cut its costs",
    hoursAgo: 21,
    shares: 34,
    body: [
      { p: "Fennick’s, the family-owned grocer with 60 stores across the south coast, is replacing one-hour delivery slots with four-hour windows — and cutting its delivery charge in half for customers who accept them." },
      { p: "The company says wider windows let each van complete more drops per trip, saving fuel and reducing the number of drivers needed at peak times." },
      { h2: "What changes for shoppers" },
      { ul: ["Four daily windows: morning, midday, afternoon and evening", "A text with a 30-minute estimate on the day", "One-hour slots still available for a higher fee"] },
      { quote: "Most people don’t need us at exactly 6:15. They need to know we’ll turn up, and they don’t want to pay for precision they don’t use.", by: "Fennick’s operations director Liam Hart" },
      { p: "Analysts say the move reflects pressure on margins across the grocery sector. Fennick’s will publish the results of the trial with its annual figures in the spring." },
    ],
  },
  {
    author: "market.pulse",
    title: "Ports, not factories: why shipping costs are driving this year’s price rises",
    hoursAgo: 44,
    shares: 118,
    body: [
      { p: "When shoppers ask why a pair of trainers costs more than last year, the answer is increasingly found not in the factory but on the water, according to new research from Northgate Business School." },
      { p: "The study tracked the landed cost of fifty everyday products and found that transport and port fees now account for a larger share of the final price than at any point in the past fifteen years." },
      { h2: "The three pressures" },
      { ul: ["Longer routes as ships avoid congested and risky waters", "Higher port fees to pay for new flood defences and electrification", "Fewer, larger ships, which leave smaller importers with less choice"] },
      { quote: "Everyone watches wages and energy. Almost nobody watches the price of moving a box from one continent to another.", by: "Dr Hélène Varo, the study’s lead author" },
      { p: "The researchers expect shipping costs to ease slightly next year as new vessels enter service, but say the days of very cheap freight are unlikely to return." },
    ],
  },
  {
    author: "market.pulse",
    title: "A co-op of 30 independent bakeries is buying its own flour mill",
    hoursAgo: 70,
    shares: 64,
    body: [
      { p: "Thirty independent bakeries have pooled their savings to buy a 19th-century flour mill outside Lessing, in a bid to protect themselves from swings in the price of wheat." },
      { p: "The co-operative will own the mill jointly, with each bakery holding one vote regardless of its size. Profits will be returned as discounts on flour." },
      { h2: "The plan" },
      { ul: ["Buy grain directly from farms within 80 kilometres", "Restore the mill’s original stones for heritage flours", "Offer tours and a small shop to cover part of the running costs"] },
      { quote: "Every time the price of flour jumped, we had a choice: raise prices or cut corners. Now we have a third option.", by: "Baker and co-op chair Nadia Brenn" },
      { p: "Local farmers have welcomed the deal. The first flour from the restored mill is expected to reach the bakeries’ shelves by the end of the year." },
    ],
  },

  /* ─────────────── Science · Field Notes ─────────────── */
  {
    author: "field.notes",
    title: "Researchers map a 300-kilometre kelp forest hidden off the Corran coast",
    hoursAgo: 6,
    link: "https://marinelab.example/papers/corran-kelp",
    shares: 157,
    body: [
      { p: "A team of marine scientists has mapped an underwater kelp forest stretching almost 300 kilometres along the Corran coast — one of the largest ever recorded, and almost entirely unknown until now." },
      { p: "The forest grows in deep, clear water beyond the reach of most divers. The team found it using autonomous boats fitted with sonar and cameras, then confirmed it with a series of deep dives." },
      { h2: "Why it matters" },
      { ul: ["Kelp forests shelter hundreds of species of fish and invertebrates", "They lock away carbon as they grow", "Many shallower forests elsewhere have shrunk as the sea has warmed"] },
      { quote: "We expected patches. We kept finding more, until we realised it was one continuous forest.", by: "Dr Keanu Hale, marine ecologist" },
      { p: "The researchers, whose <a href=\"https://marinelab.example/papers/corran-kelp\">paper</a> was published this week, are calling for part of the forest to be protected before fishing and cable-laying expand in the area." },
    ],
  },
  {
    author: "field.notes",
    title: "A tiny telescope on a school roof helped confirm a new exoplanet",
    hoursAgo: 24,
    shares: 188,
    body: [
      { p: "Students at a secondary school in Oskdal have helped confirm the existence of a planet orbiting a star about 600 light years away, using a telescope bought with money raised at bake sales." },
      { p: "The planet had been flagged as a candidate by a space telescope, but needed ground-based observations to rule out other explanations for the dip in starlight it caused." },
      { h2: "How they did it" },
      { ul: ["Twelve clear nights of observations over three months", "Precise timing of the planet crossing in front of its star", "Data shared with professional astronomers through an online network"] },
      { quote: "The first time the dip showed up on our graph, the whole club went silent. Then everyone screamed.", by: "Leila, 16, the astronomy club’s president" },
      { p: "The students are named as co-authors on the research paper. Their teacher says the club has doubled in size and already has its eye on a second candidate." },
    ],
  },
  {
    author: "field.notes",
    title: "Urban beekeepers may be feeding their bees too well, a new study suggests",
    hoursAgo: 48,
    shares: 43,
    body: [
      { p: "The boom in rooftop beehives has been good news for honey lovers — but a new study suggests too many hives in one place may be leaving wild bees short of food." },
      { p: "Researchers counted flowers and pollinators across twenty city districts and found that where honeybee hives were densest, wild bee species were noticeably rarer." },
      { h2: "What the researchers recommend" },
      { ul: ["Plant more flowers before adding more hives", "Favour native plants that bloom at different times of year", "Register hives so cities can see where they are concentrated"] },
      { quote: "Honeybees aren’t villains. But a city can only support so many mouths, and wild bees can’t move to the next rooftop.", by: "Dr Sunniva Holt, ecologist" },
      { p: "Beekeeping associations say they welcome the research and will share the planting advice with members ahead of the spring season." },
    ],
  },
  {
    author: "field.notes",
    title: "Deep-sea sensors pick up a slow-slip earthquake that lasted three weeks",
    hoursAgo: 65,
    shares: 69,
    body: [
      { p: "Seafloor instruments off the Veld coast have recorded a “slow-slip” earthquake that unfolded over three weeks — releasing as much energy as a strong quake, but so gently that nobody on land felt it." },
      { p: "Slow-slip events happen when sections of a fault creep rather than snap. They are hard to detect from land, which is why a new network of pressure sensors on the seabed was installed two years ago." },
      { h2: "What the data shows" },
      { ul: ["The seafloor moved by about four centimetres in total", "The slip travelled slowly along roughly 60 kilometres of the fault", "Small tremors clustered at the edges of the moving area"] },
      { quote: "It’s like listening to a fault breathe. Whether that breathing makes a big earthquake more or less likely is the question we’re trying to answer.", by: "Prof. Anders Lund, geophysicist" },
      { p: "Scientists stress there is no immediate risk, and say the data will help improve models used to plan for future earthquakes along the coast." },
    ],
  },

  /* ─────────────── Culture · The Back Page ─────────────── */
  {
    author: "the.back.page",
    title: "The city’s oldest cinema reopens with a 70mm print and a queue around the block",
    hoursAgo: 1.5,
    shares: 121,
    body: [
      { p: "The Palladium, the 1912 picture house that closed its doors during the pandemic, reopened on Friday night to a sold-out crowd and a queue that stretched around two corners." },
      { p: "Volunteers spent three years restoring the building, from the plaster ceiling to a pair of 70mm projectors rescued from a closing cinema in another city." },
      { h2: "What’s new — and what isn’t" },
      { ul: ["Original seats reupholstered, with extra legroom in every other row", "A small bar in the old projection booth", "A monthly silent-film night with live piano"] },
      { quote: "People keep telling me they had their first date here. Tonight I think a few people had their second.", by: "Maud Ferris, chair of the Palladium trust" },
      { p: "The opening season mixes classics with new releases and a strand of films chosen by local schools. Tickets for the first month are almost gone." },
    ],
  },
  {
    author: "the.back.page",
    title: "A debut novel written on a night bus is this summer’s surprise bestseller",
    hoursAgo: 12,
    link: "https://smallpress.example/night-route",
    shares: 97,
    body: [
      { p: "Nobody expected <em>Night Route</em> to sell. Its author, a hospital cleaner, wrote it on her phone during the hour-long bus ride home after late shifts. Its publisher is a two-person press that printed 1,500 copies." },
      { p: "Three months later it has sold more than 80,000, and bookshops are struggling to keep it on the shelves." },
      { h2: "Why readers love it" },
      { ul: ["Short chapters, each set on a different night", "A cast of regular passengers who slowly become a family", "An ending that readers refuse to spoil online"] },
      { quote: "I wrote the book I wanted to read on that bus. I didn’t think anyone else was on it with me.", by: "Author Kemi Adair" },
      { p: "Film rights have been sold, and the <a href=\"https://smallpress.example/night-route\">publisher</a> says a second printing of 50,000 copies arrives in shops next week." },
    ],
  },
  {
    author: "the.back.page",
    title: "Inside the warehouse festival that only announces its line-up at the door",
    hoursAgo: 30,
    shares: 83,
    body: [
      { p: "There is no poster, no app and no line-up. Tickets for Unlisted, held in a disused textile warehouse on the edge of Northgate, sell out anyway — to people who have no idea who they will see." },
      { p: "Organisers say the idea is to get people to listen with open ears. Acts range from a local choir to artists who usually headline much bigger stages." },
      { h2: "How it works" },
      { ul: ["The running order is printed on a card handed out at the entrance", "Phones are sealed in pouches for the whole night", "Every act is paid the same fee, whatever their fame"] },
      { quote: "The best set I saw last year was a brass band from a school I’d never heard of. I’d never have bought a ticket for them.", by: "Festival-goer Rui Castro" },
      { p: "This year’s edition takes place over three nights next month. Organisers say they will keep the format — and the secrecy — for as long as people keep coming." },
    ],
  },
  {
    author: "the.back.page",
    title: "The museum that lets its visitors rearrange the collection",
    hoursAgo: 58,
    shares: 49,
    body: [
      { p: "At the Oskdal Museum of Everyday Things, the objects on display change every month — and visitors decide how. A new exhibition, <em>Your Arrangement</em>, invites people to vote on which pieces go on show and how they are grouped." },
      { p: "Curators pick a theme and a shortlist of around two hundred objects from the stores. Visitors then vote in the galleries or online, and the winning arrangement is installed at the end of each month." },
      { h2: "Surprising results so far" },
      { ul: ["A room of kitchen clocks arranged by the time they stopped", "A shelf of lost gloves sorted by colour", "A single chair, voted in by nearly 3,000 people"] },
      { quote: "We are experts in the objects. Our visitors are experts in what those objects mean to them.", by: "Curator Ilse Brandt" },
      { p: "The museum says visitor numbers have risen by a quarter since the project began, and that many people now come back every month to see what the public chose." },
    ],
  },
];

export const DEMO_DRAFTS: DemoDraft[] = [
  {
    author: "harbor.ledger",
    title: "Election monitors arrive in Maren ahead of the run-off",
    withCover: false,
    body: [{ p: "Observers from four neighbouring states landed this morning. Notes so far: polling-station list still not published; opposition says two districts are missing from it." }],
  },
  {
    author: "circuit.desk",
    title: "Hands-on: the repairable phone that ships with its own screwdriver",
    withCover: true,
    body: [{ p: "First impressions after a week — battery swap takes under a minute. TODO: camera comparison, price, availability." }],
  },
  { author: "the.back.page", title: "Notes on the autumn gallery season", withCover: false, body: [] },
];

function escapeText(text: string): string {
  return text.replace(/&(?![a-z#0-9]+;)/gi, "&amp;");
}

/** Renders body blocks to composer-style HTML (sanitized again by the seed before storing). */
export function renderBody(blocks: Block[]): string {
  return blocks
    .map((block) => {
      if ("p" in block) return `<p>${escapeText(block.p)}</p>`;
      if ("h2" in block) return `<h2>${escapeText(block.h2)}</h2>`;
      if ("ul" in block) return `<ul>${block.ul.map((item) => `<li><p>${escapeText(item)}</p></li>`).join("")}</ul>`;
      return `<blockquote><p>${escapeText(block.quote)}</p><p>— ${escapeText(block.by)}</p></blockquote>`;
    })
    .join("");
}

/**
 * Longer follow-up sections for some stories (appended to their body), so demo reading times vary
 * between one and four minutes like a real front page.
 */
const EXTENDED: Record<string, Block[]> = {
  "Port Calder reopens its northern harbour after a six-week dredging standoff": [
    { h2: "Why the channel matters" },
    { p: "The northern harbour handles almost two thirds of the port’s container traffic. When the channel was closed, the southern berths — built for ferries and bulk cargo — had to take ships they were never designed for, and queues of lorries stretched back through the old town." },
    { p: "Businesses on the quayside say the disruption cost them far more than lost trade. “Our customers learned to go elsewhere,” said the owner of a refrigerated warehouse near the terminal. “Getting them back will take longer than six weeks.”" },
    { p: "The harbour authority has promised a public review of how the dredging contract was awarded, including why it contained no penalties for delay. Councillors will debate the terms of that review at their next meeting." },
  ],
  "Flood barriers hold as the Veld Delta records its highest spring tide in 40 years": [
    { h2: "The cost of staying dry" },
    { p: "The scheme cost roughly twice its original estimate, and for years critics argued the money would have been better spent moving homes away from the riverbanks. Last night’s tide has not ended that debate, but it has changed its tone." },
    { p: "Engineers point out that the barriers are designed for today’s sea level plus a margin for the next fifty years. If the sea rises faster than expected, the gates will need to close more often — and eventually be raised." },
    { ul: ["Gate closures so far this season: 7", "Average closures per year when the scheme was planned: 3", "Estimated remaining design life: 45–60 years"] },
    { p: "That is why the delta authority is also paying farmers upstream to let certain fields flood during storms, giving the rivers somewhere to go before the water reaches the towns." },
    { quote: "Walls buy us time. What we do with that time is the real flood defence.", by: "Dr Mira Olsen, hydrologist at the delta authority" },
    { p: "Residents in the lowest-lying streets say they will believe the barrier works after a few more winters like this one. For now, many kept sandbags at the door all night — just in case." },
  ],
  "The night train between Maren and Oskdal returns after a decade away": [
    { h2: "Why night trains disappeared — and why they’re back" },
    { p: "When the old service was cut, it was losing money on almost every journey. Budget airlines had made the same trip cheaper and, on paper, faster. Carriages were old, maintenance was expensive, and the two national railways could not agree on how to share the costs." },
    { p: "A decade later, the arithmetic looks different. Short-haul flights now come with long airport queues and baggage fees, and a growing number of travellers are choosing rail for environmental reasons. A night train also saves the cost of a hotel — something the operators are putting at the centre of their marketing." },
    { ul: ["Journey time: 11 hours, departing 21:40 and arriving 08:40", "Carriages: refurbished sleepers bought second-hand from another operator", "Staff: two attendants per carriage, both bilingual"] },
    { h2: "On board the first departure" },
    { p: "The atmosphere on the platform in Maren was closer to a festival than a commute. A brass band played as the train pulled in, and several passengers had dressed in the style of the 1970s posters that once advertised the route." },
    { p: "Inside, the cabins are compact but thoughtfully designed: fold-down tables, reading lights, sockets at every berth and a small washbasin in the two-berth compartments. The restaurant car serves regional dishes from both countries, and the bar stayed busy until well after midnight." },
    { quote: "People keep asking whether it will last. Honestly, it depends on them. If they ride it, it stays.", by: "Train manager Oskar Lindgren" },
    { h2: "The questions that remain" },
    { p: "The joint venture has funding for five years. After that, the service must either break even or persuade both governments to keep supporting it. The operators say they are optimistic, pointing to strong advance bookings for the winter holidays." },
    { p: "Rail campaigners want the next step to be a connection at Oskdal to the northern lines, which would let passengers continue to the mountain resorts without changing stations. That would need new track work at the border — and another round of negotiations." },
    { p: "For the passengers stepping off in Oskdal on Wednesday morning, those questions could wait. Many stopped to take photographs of the train before heading into the city; a few went straight to the ticket office to book the journey home." },
  ],
  "A 12-person startup just shipped the fastest open-source browser engine we’ve tested": [
    { h2: "How we tested" },
    { p: "We ran each engine on the same mid-range laptop, with a fresh profile, no extensions and the same network conditions. Every test was repeated five times and we report the median. Pages were chosen to reflect a normal day of reading: news sites, a recipe blog, a long documentation page and a social feed." },
    { p: "Performance is not the only thing that matters in a browser, and Lumen is honest about that. There is no built-in password manager, sync is still experimental and the extension system supports only a small subset of popular add-ons." },
    { p: "But for anyone curious about how the web works — or tired of a handful of companies controlling the software everyone uses to read it — Lumen is worth an afternoon of your time." },
  ],
  "Why your next laptop battery might be solid-state — and why it still isn’t": [
    { h2: "A short explainer" },
    { p: "Every rechargeable lithium battery has two electrodes and something in between that lets charged particles move back and forth. In today’s batteries, that something is a liquid — which works well, but can catch fire if the cell is damaged or overheated." },
    { p: "A solid electrolyte removes most of that risk. It can also allow a different material on one side of the battery, which is where the promised jump in capacity comes from. In theory, a laptop could run for a working week between charges, or a phone could fill up in ten minutes." },
    { h2: "Where the promises meet reality" },
    { p: "The first commercial cells are closer to “a bit better” than “twice as good.” Manufacturers are playing it safe, using solid-state designs mainly to make batteries thinner and more robust rather than to chase headline capacity numbers." },
    { ul: ["Expect higher prices for the first generation of devices", "Charging speeds may be limited at first to protect the cells", "Early warranties will tell you how confident makers really are"] },
    { p: "There is also the question of materials. Some of the most promising solid electrolytes rely on elements that are scarce or difficult to mine responsibly, and recycling methods for the new cells are still at the pilot stage." },
    { quote: "The best battery is the one that’s still working in year five. We’ll only know that about solid-state in year five.", by: "Tom Weller, device-repair technician" },
    { p: "In other words: if you need a new laptop now, buy the one that suits you today. The solid-state future is coming, but it is arriving the way most technology does — slowly, then all at once." },
  ],
  "Council bans facial recognition in public housing after a two-year residents’ campaign": [
    { h2: "How the campaign won" },
    { p: "Residents began by collecting their own evidence: every time the system failed to open a door, they wrote down the time, the entrance and who was affected. After a year they had more than 1,400 entries, which they presented to councillors alongside letters from local doctors and teachers." },
    { p: "Campaigners say the lesson for other estates is simple: keep records, stay polite and keep turning up. “We went to every single meeting,” said one organiser. “Eventually it became easier for them to listen than to ignore us.”" },
  ],
  "Harbour City score three in 18 minutes to overturn a two-goal deficit and stay top": [
    { h2: "Talking points" },
    { p: "Reyna’s impact raises an obvious question: why isn’t he starting? The coach has preferred a more defensive shape away from home, but after this performance it will be hard to leave the 20-year-old on the bench for the visit to second-placed Stonebridge next week." },
    { p: "Ridgeway will rue two missed chances just after half-time that would have made the game safe. Their manager was blunt afterwards: “We stopped playing at 2–0. You can’t do that against the league leaders in their own stadium.”" },
    { p: "City’s supporters, who had spent half-time questioning the team selection, stayed long after the final whistle to sing Reyna’s name. It was, one steward said, the loudest the stadium had been in years." },
  ],
  "At 41, Ines Varga wins the Coastal Marathon on the streets where she learned to run": [
    { h2: "The rest of the field" },
    { p: "Behind Varga, last year’s winner Hanne Solberg held on for second despite losing a shoe at a drinks station, while 22-year-old debutant Lucía Moreno finished third in a time that would have won the race most years." },
    { p: "In the men’s race, a lead group of five stayed together until the final bridge, where Yusuf Kaan surged clear to win in a course record. Wheelchair champion Pieter Blom won for the fourth year running." },
    { p: "Organisers say more than 3,000 volunteers helped on the day. Next year’s entries open next month, and the race has already confirmed it will keep the new seafront finish." },
  ],
  "Independent bookshops post their best quarter in a decade as readers return to the high street": [
    { h2: "What makes a bookshop work now" },
    { p: "Many of the new shops look very different from the dusty, crowded stores of old. Several combine books with coffee, stationery or a small gallery. Others specialise — in crime fiction, cookery, children’s picture books or translated literature — and build a loyal following online as well as in person." },
    { p: "Owners also report that younger readers are driving much of the growth, often discovering books through recommendations shared on social media and then seeking out a local shop to buy them." },
    { p: "Not every town is benefiting. The report notes that closures continue in areas with falling footfall and very high rents, and that the average owner still earns less than the national median wage." },
  ],
  "Ports, not factories: why shipping costs are driving this year’s price rises": [
    { h2: "Following a single pair of trainers" },
    { p: "To make the point, the researchers traced one pair of mid-priced trainers from a factory to a high-street shop. Manufacturing costs had barely changed in three years. The cost of getting them onto a ship, across the ocean and through a port had risen by more than half." },
    { p: "Much of that increase comes from longer routes. Ships that once took the shortest path now sail thousands of extra kilometres to avoid congested canals and risky waters, burning more fuel and spending more days at sea." },
    { h2: "Why smaller importers feel it most" },
    { p: "Large retailers can sign long-term contracts with shipping lines and lock in prices. Small businesses usually buy space on the spot market, where prices swing wildly from month to month." },
    { ul: ["Big retailers: contracts fixed for one to three years", "Small importers: prices that can double within a season", "Result: small shops raise prices sooner and more often"] },
    { p: "Port fees add another layer. Many ports are investing heavily in flood defences, cleaner cranes and shore power so that docked ships can switch off their engines. Those investments are necessary, the study says, but they are being passed on to customers faster than most people realise." },
    { quote: "We keep asking consumers to understand inflation. We rarely show them the journey their shopping takes.", by: "Dr Hélène Varo" },
    { p: "The researchers want governments to publish a simple index of shipping and port costs alongside the usual inflation figures, so that shoppers and small businesses can see what is really driving prices." },
  ],
  "A co-op of 30 independent bakeries is buying its own flour mill": [
    { h2: "How the money was raised" },
    { p: "Each bakery contributed an equal share, borrowed from a community bank or raised through small loans from regular customers, some of whom will be repaid partly in bread. A regional heritage fund covered the cost of repairing the mill’s roof and waterwheel." },
    { p: "The co-op has hired a retired miller to train two apprentices, and hopes the site will eventually host baking classes for local schools." },
    { p: "Other groups of small food producers — including cheesemakers and brewers — have asked the bakers for advice on setting up similar schemes." },
  ],
  "Researchers map a 300-kilometre kelp forest hidden off the Corran coast": [
    { h2: "How the survey worked" },
    { p: "The team’s autonomous boats criss-crossed the coast for eight months, mapping the seabed with sonar and sending down cameras wherever the data suggested something tall and dense was growing. Divers then visited sixty sites to identify species and measure the kelp by hand." },
    { p: "The forest is made up mostly of a single species that can grow half a metre in a week during summer. At its thickest, divers described swimming through it as “like moving through a cathedral made of seaweed”." },
    { p: "The researchers now plan to return every season to see how the forest changes with temperature and storms — data they say will help protect kelp elsewhere." },
  ],
  "A tiny telescope on a school roof helped confirm a new exoplanet": [
    { h2: "What they found" },
    { p: "The planet is a gas giant slightly larger than Jupiter, orbiting so close to its star that a year there lasts just four days. It is far too hot for life, but its size and short orbit make it a good target for future studies of planetary atmospheres." },
    { p: "Professional astronomers say student observations like these are genuinely useful. Big telescopes are too busy to watch every candidate, and a network of small ones spread across different time zones can catch transits the others miss." },
    { p: "The school plans to name its telescope after the club’s founder, a physics teacher who retired last year and who, students say, never once let a cloudy sky stop an observing night." },
  ],
  "Deep-sea sensors pick up a slow-slip earthquake that lasted three weeks": [
    { h2: "Why slow earthquakes are so hard to see" },
    { p: "Ordinary earthquakes release energy in seconds, sending out waves that seismometers on land record easily. A slow-slip event spreads the same kind of movement over days or weeks. The ground moves, but so gently that it barely registers as shaking at all." },
    { p: "Offshore, where many of the most dangerous faults lie, the problem is worse. Instruments on land are too far away to notice centimetres of movement on the seabed, and satellites cannot see through the water." },
    { h2: "What the new network does differently" },
    { ul: ["Pressure sensors measure tiny changes in water depth as the seabed rises or sinks", "A cable to shore delivers data in real time instead of once a year", "Clocks accurate to a millionth of a second let scientists line up events precisely"] },
    { p: "The network cost less than a single research ship voyage per year to run, according to the institute that operates it, and has already recorded several smaller slow-slip events that would otherwise have gone unnoticed." },
    { p: "Researchers are now comparing this event with records from similar faults around the world. In some places, slow-slip has preceded large earthquakes; in others, it seems to relieve stress harmlessly. Understanding which is which is one of the most important open questions in the field." },
    { quote: "We used to think faults were either locked or slipping. It turns out they have moods.", by: "Dr Rafaela Soto, seismologist" },
  ],
  "The city’s oldest cinema reopens with a 70mm print and a queue around the block": [
    { h2: "Three years, 400 volunteers" },
    { p: "The restoration was funded largely by small donations, a crowdfunding campaign and a grant from the city’s heritage fund. Volunteers — from retired electricians to film students — gave more than 60,000 hours of work, including stripping and repainting every one of the auditorium’s 480 seats." },
    { p: "The trust has resisted pressure to split the building into smaller screens. “A big room full of strangers laughing at the same moment — that’s the point,” said one volunteer projectionist." },
    { p: "Membership has passed 5,000, and the trust says it will reinvest every penny of profit in the building and in free screenings for schools." },
  ],
  "A debut novel written on a night bus is this summer’s surprise bestseller": [
    { h2: "From phone notes to printed page" },
    { p: "Adair wrote the first draft over two years, mostly in the notes app on her phone, sometimes a paragraph at a time between stops. She sent the finished manuscript to eleven agents and received eleven rejections before submitting it directly to the small press that eventually published it." },
    { p: "The publisher, which had never sold more than 3,000 copies of any title, says the first sign that something was different came from booksellers. Shops that had ordered two copies came back asking for twenty, then fifty." },
    { h2: "Word of mouth, the old-fashioned way" },
    { p: "There was no big marketing campaign. Instead, readers began leaving copies on buses with notes inside the cover encouraging the next passenger to read it and pass it on. Photos of those notes spread online, and the book followed." },
    { ul: ["Weeks in the bestseller list so far: 9", "Languages it is being translated into: 14", "Copies found on buses by the publisher’s own staff: 3"] },
    { p: "Bus drivers have become unlikely ambassadors. Several have told reporters that passengers now ask them which route the book is set on, and whether the characters are based on real people." },
    { quote: "Everyone on that bus had a story. I just happened to be the one writing mine down.", by: "Kemi Adair" },
    { p: "Adair has now left her job to write full time, though she says she still takes the night bus sometimes. Her second novel, due next year, is set in a hospital at 3am." },
  ],
};

/** A story's full body: its main blocks plus any extended sections. */
export function articleBlocks(article: DemoArticle): Block[] {
  return [...article.body, ...(EXTENDED[article.title] ?? [])];
}

/** Titles with extended sections that don't match any story (guards against typos). */
export function unmatchedExtensions(): string[] {
  const titles = new Set(DEMO_ARTICLES.map((a) => a.title));
  return Object.keys(EXTENDED).filter((title) => !titles.has(title));
}
