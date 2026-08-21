"use client";

export function NexoraDashboard() {
  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.4)",
        border: "1px solid rgba(255, 255, 255, 0.5)",
        boxShadow:
          "var(--shadow-dashboard, 0 25px 80px -12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.06))",
      }}
      className="w-full rounded-2xl overflow-hidden p-3 md:p-4 backdrop-blur-md"
    >
      {/* Dashboard Chrome / Window */}
      <div className="w-full rounded-xl overflow-hidden bg-white border border-black/[0.06] shadow-sm text-[11px] select-none pointer-events-none font-body text-foreground">
        {/* 1. Top Bar */}
        <div className="flex items-center justify-between border-b border-black/[0.06] bg-white px-4 py-2.5">
          {/* Left: Logo 'N' + Nexora + Chevron */}
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-foreground text-[10px] font-bold text-white shadow-xs">
              N
            </div>
            <span className="font-semibold text-xs text-foreground tracking-tight">Nexora</span>
            <svg viewBox="0 0 16 16" className="h-3 w-3 text-muted-foreground fill-none stroke-current stroke-2">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </div>

          {/* Center: Search Bar with ⌘K */}
          <div className="flex items-center gap-2 rounded-full border border-black/[0.08] bg-secondary/60 px-3 py-1 text-muted-foreground w-64 md:w-80 shadow-inner">
            <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 fill-none stroke-current stroke-2">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" />
            </svg>
            <span className="flex-1 text-[10px] text-muted-foreground truncate">Search or type a command...</span>
            <span className="rounded border border-black/[0.1] bg-white px-1.5 py-0.2 text-[9px] font-mono font-medium text-muted-foreground">
              ⌘K
            </span>
          </div>

          {/* Right: Move Money + Bell + Avatar JB */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="rounded-full bg-foreground text-background px-3 py-1 text-[10px] font-medium shadow-xs"
            >
              Move Money
            </button>
            <div className="relative p-1 text-muted-foreground">
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-2">
                <path d="M8 2a3 3 0 00-3 3v2.5L3.5 10h9L11 7.5V5a3 3 0 00-3-3zM6.5 12a1.5 1.5 0 003 0" />
              </svg>
            </div>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 shadow-inner">
              JB
            </div>
          </div>
        </div>

        {/* Dashboard Body */}
        <div className="flex min-h-[440px]">
          {/* 2. Sidebar */}
          <aside className="w-40 shrink-0 border-r border-black/[0.06] bg-slate-50/50 p-2.5 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Primary Nav */}
              <nav className="space-y-0.5" aria-label="Dashboard navigation">
                {/* Home (active) */}
                <div className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 font-medium text-foreground shadow-xs border border-black/[0.04]">
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 text-foreground">
                    <path d="M2.5 6.5L8 2l5.5 4.5V13a1 1 0 01-1 1h-9a1 1 0 01-1-1V6.5z" />
                  </svg>
                  <span>Home</span>
                </div>

                {/* Tasks with badge 10 */}
                <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-muted-foreground hover:bg-black/[0.02]">
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-2">
                      <path d="M3 4.5h10M3 8h10M3 11.5h6" />
                    </svg>
                    <span>Tasks</span>
                  </div>
                  <span className="rounded-full bg-slate-200/80 px-1.5 py-0.2 text-[9px] font-medium text-slate-700">
                    10
                  </span>
                </div>

                {/* Transactions */}
                <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground hover:bg-black/[0.02]">
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-2">
                    <path d="M2 4h12v9a1 1 0 01-1 1H3a1 1 0 01-1-1V4zM5 8h6M5 11h4" />
                  </svg>
                  <span>Transactions</span>
                </div>

                {/* Payments (with chevron) */}
                <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-muted-foreground hover:bg-black/[0.02]">
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-2">
                      <path d="M2 5h12v7a1 1 0 01-1 1H3a1 1 0 01-1-1V5zM2 8h12" />
                    </svg>
                    <span>Payments</span>
                  </div>
                  <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 fill-none stroke-current stroke-2 opacity-50">
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </div>

                {/* Cards */}
                <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground hover:bg-black/[0.02]">
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-2">
                    <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
                    <line x1="2" y1="6.5" x2="14" y2="6.5" />
                  </svg>
                  <span>Cards</span>
                </div>

                {/* Capital */}
                <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground hover:bg-black/[0.02]">
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-2">
                    <circle cx="8" cy="8" r="5.5" />
                    <path d="M8 5v6M6 7h4" />
                  </svg>
                  <span>Capital</span>
                </div>

                {/* Accounts (with chevron) */}
                <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-muted-foreground hover:bg-black/[0.02]">
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-2">
                      <path d="M2 13V5l6-3 6 3v8H2zM6 13V8h4v5" />
                    </svg>
                    <span>Accounts</span>
                  </div>
                  <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 fill-none stroke-current stroke-2 opacity-50">
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </div>
              </nav>

              {/* Section: Workflows */}
              <div className="pt-2 border-t border-black/[0.05]">
                <p className="px-2 pb-1 text-[9px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
                  Workflows
                </p>
                <div className="space-y-0.5 text-muted-foreground">
                  <div className="rounded-lg px-2.5 py-1 hover:bg-black/[0.02]">Trake rutes</div>
                  <div className="rounded-lg px-2.5 py-1 hover:bg-black/[0.02]">Payments</div>
                  <div className="rounded-lg px-2.5 py-1 hover:bg-black/[0.02]">Notifications</div>
                  <div className="rounded-lg px-2.5 py-1 hover:bg-black/[0.02]">Settings</div>
                </div>
              </div>
            </div>
          </aside>

          {/* 3. Main Content Area */}
          <main className="flex-1 bg-secondary/30 p-3.5 flex flex-col gap-3 overflow-hidden">
            {/* Greeting */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Welcome, Jane</h2>
            </div>

            {/* Action Buttons Row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                className="rounded-full bg-accent text-accent-foreground px-3 py-1 text-[10px] font-medium shadow-xs"
              >
                Send
              </button>
              {["Request", "Transfer", "Deposit", "Pay Bill", "Create Invoice"].map((act) => (
                <button
                  key={act}
                  type="button"
                  className="rounded-full bg-white border border-black/[0.08] px-2.5 py-1 text-[10px] text-foreground font-medium shadow-xs"
                >
                  {act}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-muted-foreground font-medium cursor-pointer">
                Customize
              </span>
            </div>

            {/* Two Equal-Width Cards Side by Side */}
            <div className="flex gap-3">
              {/* Card 1: Balance Card */}
              <div className="flex-1 basis-0 rounded-xl bg-white p-3 border border-black/[0.06] shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-muted-foreground text-[10px]">
                    <span className="font-medium text-foreground">Mercury Balance</span>
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                      <svg viewBox="0 0 16 16" className="h-2 w-2 fill-none stroke-current stroke-[2.5]">
                        <path d="M3 8.5l3.5 3.5 6.5-7" />
                      </svg>
                    </span>
                  </div>

                  <div className="mt-1 flex items-baseline gap-0.5">
                    <span className="text-xl font-bold tracking-tight text-foreground">
                      $8,450,190
                    </span>
                    <span className="text-xs text-muted-foreground">.32</span>
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-[9px] text-muted-foreground">
                    <span>Last 30 Days</span>
                    <span className="font-medium text-emerald-600">+$1.8M</span>
                    <span className="font-medium text-rose-500">-$900K</span>
                  </div>
                </div>

                {/* Smooth Cubic Bézier Area Chart */}
                <div className="mt-2 h-20 w-full">
                  <svg
                    viewBox="0 0 340 70"
                    preserveAspectRatio="none"
                    className="h-full w-full overflow-visible"
                  >
                    <defs>
                      <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent, #6366f1)" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="var(--accent, #6366f1)" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    {/* Area fill */}
                    <path
                      d="M 0 52 C 40 45, 70 20, 110 32 C 150 44, 180 14, 220 22 C 260 30, 290 8, 340 12 L 340 70 L 0 70 Z"
                      fill="url(#balanceGradient)"
                    />
                    {/* Stroke line */}
                    <path
                      d="M 0 52 C 40 45, 70 20, 110 32 C 150 44, 180 14, 220 22 C 260 30, 290 8, 340 12"
                      fill="none"
                      stroke="var(--accent, #6366f1)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>

              {/* Card 2: Accounts Card */}
              <div className="flex-1 basis-0 rounded-xl bg-white p-3 border border-black/[0.06] shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between pb-1 border-b border-black/[0.04]">
                  <span className="font-semibold text-xs text-foreground">Accounts</span>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <button type="button" className="p-0.5 hover:text-foreground">
                      <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current stroke-2">
                        <path d="M8 3v10M3 8h10" />
                      </svg>
                    </button>
                    <button type="button" className="p-0.5 hover:text-foreground">
                      <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current stroke-2">
                        <circle cx="8" cy="4" r="1" fill="currentColor" />
                        <circle cx="8" cy="8" r="1" fill="currentColor" />
                        <circle cx="8" cy="12" r="1" fill="currentColor" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-around py-1">
                  {/* Credit Row */}
                  <div className="flex items-center justify-between py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-indigo-500" />
                      <span className="text-foreground font-medium">Credit</span>
                    </div>
                    <span className="font-semibold text-foreground">$98,125.50</span>
                  </div>

                  {/* Treasury Row */}
                  <div className="flex items-center justify-between py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="text-foreground font-medium">Treasury</span>
                    </div>
                    <span className="font-semibold text-foreground">$6,750,200.00</span>
                  </div>

                  {/* Operations Row */}
                  <div className="flex items-center justify-between py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-amber-500" />
                      <span className="text-foreground font-medium">Operations</span>
                    </div>
                    <span className="font-semibold text-foreground">$1,592,864.82</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="rounded-xl bg-white p-3 border border-black/[0.06] shadow-xs">
              <h3 className="text-xs font-semibold text-foreground mb-2">Recent Transactions</h3>
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="border-b border-black/[0.04] text-muted-foreground font-medium">
                      <th className="pb-1.5 font-medium">Date</th>
                      <th className="pb-1.5 font-medium">Description</th>
                      <th className="pb-1.5 font-medium">Amount</th>
                      <th className="pb-1.5 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.03]">
                    {/* Row 1 */}
                    <tr>
                      <td className="py-2 text-muted-foreground">Oct 24</td>
                      <td className="py-2 font-medium text-foreground">AWS</td>
                      <td className="py-2 font-medium text-foreground">-$5,200</td>
                      <td className="py-2 text-right">
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-medium text-amber-700 border border-amber-200/60">
                          Pending
                        </span>
                      </td>
                    </tr>

                    {/* Row 2 */}
                    <tr>
                      <td className="py-2 text-muted-foreground">Oct 23</td>
                      <td className="py-2 font-medium text-foreground">Client Payment</td>
                      <td className="py-2 font-medium text-emerald-600">+$125,000</td>
                      <td className="py-2 text-right">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700 border border-emerald-200/60">
                          Completed
                        </span>
                      </td>
                    </tr>

                    {/* Row 3 */}
                    <tr>
                      <td className="py-2 text-muted-foreground">Oct 22</td>
                      <td className="py-2 font-medium text-foreground">Payroll</td>
                      <td className="py-2 font-medium text-foreground">-$85,450</td>
                      <td className="py-2 text-right">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700 border border-emerald-200/60">
                          Completed
                        </span>
                      </td>
                    </tr>

                    {/* Row 4 */}
                    <tr>
                      <td className="py-2 text-muted-foreground">Oct 21</td>
                      <td className="py-2 font-medium text-foreground">Office Supplies</td>
                      <td className="py-2 font-medium text-foreground">-$1,200</td>
                      <td className="py-2 text-right">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700 border border-emerald-200/60">
                          Completed
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
