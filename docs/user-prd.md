# Infinite Canvas Studio — User PRD & Usage Guide

> Document version: 1.0  
> Last updated: 2026-07-17  
> Audience: product users, merchandisers, designers, QA, onboarding  
> Related engineering PRD: [docs/PRD.md](./PRD.md)

---

## 1. What this product is

**Infinite Canvas Studio** is a desktop-first workspace for apparel / soft-goods product development. It helps teams:

1. Maintain reusable **Customer**, **Supplier**, and **Product** records  
2. Create **Projects** and visual **Canvases**  
3. Connect product references, colors, and AI generation on an infinite node board  
4. Send a canvas report for **customer approval**  
5. After approval, issue **supplier sampling / purchase** emails  
6. Track **Sample Status** through production stages  

The app can run in:

| Mode | Meaning |
| ---- | ------- |
| **Local mode** | Works without cloud keys; data stays in the browser for demo / offline use |
| **Cloud sync** | Supabase auth + Postgres + Storage when configured |
| **AI enabled / disabled** | Image generation is available only when Xiangsu / provider keys are configured |

Runtime badges appear at the bottom of the left menu.

---

## 2. Shell layout (how the page is organized)

```
┌──────────────────┬──────────────────────────────────────────────┐
│ Left menu        │ Top tab strip (open work areas)              │
│ (L1 sections)    ├──────────────────────────────────────────────┤
│  └ L2 items      │ Right frame / main content                   │
│                  │  - forms, tables, project list, canvas…      │
│ Runtime badges   │                                              │
└──────────────────┴──────────────────────────────────────────────┘
```

### Shell behaviors

| Control | Usage |
| ------- | ----- |
| Collapse / expand menu | Icon button at top of sidebar |
| Click L1 section | Expands/collapses children; for Project, Sample Status, Settings also opens that tab |
| Click L2 item | Opens (or focuses) a main tab and sets create vs view mode where relevant |
| Tab strip | Keep multiple areas open; click a tab to switch; close a tab with its close control |
| Close **Project** tab | Clears the in-memory selected project and canvas |

---

## 3. Left menu — Level 1 and Level 2

| Level 1 | Level 2 | Opens main tab | Mode / notes |
| ------- | ------- | -------------- | ------------ |
| **Customer** | New | Customer + | Create form (`mode = new`) |
| **Customer** | View / edit | Customer + | Directory / edit (`mode = records`) |
| **Product** | New | Product + | Create form |
| **Product** | View / edit | Product + | Product directory |
| **Supplier** | New | Supplier + | Create form |
| **Supplier** | View / edit | Supplier + | Directory (table + multi-delete) |
| **Project** | View / edit | Project | Project list → detail → canvas |
| **Sample Status** | _(none)_ | Sample Status | Opens dashboard directly |
| **Settings** | SMTP setting | SMTP Setting | Test email + provider help |
| **Settings** | Currency | Currency | Ordered option list |
| **Settings** | Destination country | Destination Country | Ordered option list |
| **Settings** | Address book | Address Book | Reusable email recipients |
| **Settings** | Generic node | Generic Node | Canvas palette presets |

---

## 4. Main tabs (right frame titles)

| Tab label | Content |
| --------- | ------- |
| Customer + | Customer company / employee / product forms or directory |
| Product + | Product create form or product records table |
| Supplier + | Supplier company / employee / product forms or directory |
| Project | Project list, project detail + canvases, or embedded canvas editor |
| Sample Status | Sampling operations dashboard |
| SMTP Setting | SMTP status cards + test email |
| Currency | Currency options manager |
| Destination Country | Destination options manager |
| Address Book | Address-book options manager |
| Generic Node | Generic node definition manager |

---

## 5. User forms — input fields, mini-tabs, buttons

### 5.1 Customer (+)

#### Mini-tabs (create / edit)

| Mini-tab | When available |
| -------- | -------------- |
| **Company** | Always |
| **Employee** | After company fields validate / are complete |
| **Product** | After company is complete (and after save flow when creating) |

#### Company form — fields

| Field | Required | Notes |
| ----- | -------- | ----- |
| Company name | Yes | e.g. Acme Fashion Ltd. |
| Email domain suffix | Yes | Domain only (`acme.com`); `@` is stripped |
| Type | Yes | Free text: Brand owner, agent, distributor… |

#### Company form — buttons

| Button | Usage |
| ------ | ----- |
| **Dummy input** | Fills sample company data for demos |
| **Save and add employees** | Validates company, unlocks Employee mini-tab |

#### Employee form — fields (per contact)

| Field | Required | Notes |
| ----- | -------- | ----- |
| User name | Yes | Contact display name |
| Email prefix | Yes | Combined with company domain → full email |
| Title | Yes | Job title |
| Tel | Yes | Phone |

#### Employee form — buttons

| Button | Usage |
| ------ | ----- |
| **Dummy employees** | Fills sample contacts |
| **Add more** | Adds another employee card |
| Remove (trash icon) | Removes one employee card |
| **Save employees** / **Update employees** | Saves full customer record |

#### Product mini-tab

Embeds the product form for this customer (see Product form). After first save, a dialog may ask:

| Dialog action | Usage |
| ------------- | ----- |
| **Not now** | Return to customer records |
| **Add product** | Switch to Product mini-tab |

#### View / edit directory

| Control | Usage |
| ------- | ----- |
| Search company or employee | Fuzzy search |
| Expand/collapse record | Show employee list |
| **Add product** | Jump into product creation for that company |
| **Edit** | Open company form in edit mode |
| Product images browser | View linked product images |

---

### 5.2 Supplier (+)

Same shell as Customer, with supplier-specific company fields.

#### Company form — fields

| Field | Required | Notes |
| ----- | -------- | ----- |
| Company name | Yes | |
| Email domain suffix | Yes | Domain only |
| Product type | Yes (≥1) | Multi-select from: woven label, wash care label, hang tag, heat transfer, elastic, drawcord, metal, button, PU patch, embroidery patch, silicon patch, thread, polybag |

#### Company form — buttons

| Button | Usage |
| ------ | ----- |
| **Dummy input** | Sample supplier company + product types |
| **Save and add employees** | Unlock Employee mini-tab |

#### Employee form

Same fields and buttons as Customer employees.

#### View / edit directory (table)

| Control | Usage |
| ------- | ----- |
| Search / column filters | company, domain, product types, employees, products |
| Row checkbox | Multi-select for batch delete |
| **Delete selected (N)** | Confirmed batch delete; products become unlinked |
| **Delete** (row) | Delete one supplier |
| Product image browser | View supplier product images |
| **Edit** | Edit supplier |
| **Add product** | Create product owned by this supplier |

---

### 5.3 Product (+)

#### Create form — main fields

| Field | Required | Notes |
| ----- | -------- | ----- |
| Supplier _(standalone product tab only)_ | Yes when owner is supplier | Searchable supplier list |
| Product type | Yes | Customer garment categories **or** supplier trim types |
| Internal code | Yes | Subject / internal product code |
| Product details | Yes | Specs, construction, packaging, quality notes |
| Material | Yes (per active variant) | |
| Color notes | Yes (per active variant) | Pantone, finish, contrast… |
| Type-specific parameters | Optional | Depends on product type (Width, Height, Fold, Weave…) |
| Unit price | Yes (per active variant) | Price unit is auto-set by type |
| Product image | Yes (≥1 per variant) | Paste, drop, or choose files; each image → numbered variant |

#### Create form — buttons

| Button | Usage |
| ------ | ----- |
| **Dummy input** | Fills sample product + variants |
| **Dummy parameters** | Fills type-specific parameter templates |
| **Save product** / **Update product** | Persist product |
| Variant number chips | Switch active variant |
| Image grid select | Switch active variant by thumbnail |
| **Choose images** | File picker |
| Remove image (X) | Clear active variant image |
| **Remove current variant** | Delete variant (disabled if only one) |

#### View / edit directory

| Column / action | Usage |
| --------------- | ----- |
| Search product records | Filter list |
| View | Open image browser for that product |
| Edit | Load product into form |

---

### 5.4 Project

#### Project list

| Control | Usage |
| ------- | ----- |
| Fuzzy search projects | Filter projects |
| **New project** | Open create dialog |
| Open project | Go to project detail |
| Open canvas (from list) | Jump into canvas |
| **Send supplier purchase** | After canvas is approved |
| **Delete** | Confirmed project delete (cascades canvases) |

#### New project dialog — fields

| Field | Required | Notes |
| ----- | -------- | ----- |
| Customer company | Yes | Fuzzy search, then select |
| Employer / contact | Yes | Auto-select if only one employee |
| Name | Yes | Project name |
| Currency | Yes | From Settings → Currency |
| Delivery destination | Yes | From Settings → Destination country |

#### New project dialog — buttons

| Button | Usage |
| ------ | ----- |
| **Cancel** | Close without saving |
| **Create** / **Creating...** | Create project and open it |

#### Project detail

| Control | Usage |
| ------- | ----- |
| **Projects** (back) | Return to list |
| Project header metadata | Name, customer snapshot, currency, destination |
| Canvas list | Create, open, send, purchase, delete canvases |

#### Canvas list / send report dialog

| Control | Usage |
| ------- | ----- |
| **Open** | Open canvas editor |
| **Send** | Open “Send canvas report” |
| Recipient email(s) | Manual entry and/or address book |
| Select exactly one render | Required for send |
| **Send report** | Email report + set status to awaiting approval |
| **Send supplier purchase** | After approval only |
| **Delete** | Delete canvas |

---

### 5.5 Sample Status

#### Summary cards

- Supplier orders  
- Needs attention  
- Awaiting approval  
- Sample approved  

#### Filters

| Control | Usage |
| ------- | ----- |
| Search CA, project, canvas, supplier | Text |
| Stage select | Filter by sampling stage |
| Approval select | Filter by approval status |
| Sort | Updated desc/asc, CA asc |

#### Row / detail actions

| Button | Usage |
| ------ | ----- |
| Expand / collapse | Show supplier contacts, purchase lines, timeline |
| **Retry** purchase email | Resend failed purchase email |
| **Retry** approval email | Resend failed approval email |
| Open approved canvas report | External report link |
| **Generate 10 demo orders** | Local mode only |

---

### 5.6 Settings forms

#### SMTP Setting

| Field / control | Usage |
| --------------- | ----- |
| Provider cards | Show local / 163.com / Gmail setup (env var names only; no secrets) |
| Recipient email | Test destination |
| **Send test email** | Real SMTP test using same primary→backup path as Canvas Send |

#### Currency / Destination country / Address book

Shared ordered-option manager.

| Kind | Fields in Add/Edit dialog |
| ---- | ------------------------- |
| Currency | Code, Name, Symbol |
| Destination country | Code, Name |
| Address book | Email address, Display name |

| List buttons | Usage |
| ------------ | ----- |
| Search | Filter options |
| **Add …** | Open create dialog |
| Edit | Open edit dialog |
| Delete | Confirmed remove |
| Move up / down | Reorder preferred sequence |
| Favorite (where available) | Pin preferred options |

Dialog buttons: **Cancel**, **Add …** / **Save changes**.

#### Generic node

| Field | Required | Notes |
| ----- | -------- | ----- |
| Node name | Yes | Appears on canvas palette |
| Node images | Yes (≥1) | Multi-image upload |

| Buttons | Usage |
| ------- | ----- |
| Search | Filter definitions |
| **Add generic node** | Create palette preset |
| Edit / Delete / Reorder | Manage definitions |
| **Cancel** / **Add generic node** / **Save changes** | Dialog actions |

---

## 6. How to use this web page (step-by-step)

### 6.1 First-time setup (recommended order)

1. Open **Settings → Currency** and add at least one currency (e.g. USD).  
2. Open **Settings → Destination country** and add destinations you ship to.  
3. Optionally fill **Address book** with frequent approval recipients.  
4. Optionally create **Generic node** presets (fabric / hardware reference packs).  
5. If you need email: configure SMTP env vars, then **Settings → SMTP setting → Send test email**.

### 6.2 Build master data

1. **Customer → New**  
   - Fill Company → **Save and add employees**  
   - Add contacts → **Save employees**  
   - Optionally **Add product** for that customer  
2. **Supplier → New**  
   - Fill company + product types → employees → save  
   - Optionally add supplier products  
3. Or use **Product → New** to create products against an existing supplier/customer.

Tips:

- Use **Dummy input** only for demos/training.  
- Employee email is always `prefix@company-domain`.  
- Supplier product types limit which product types that supplier can own.

### 6.3 Create a project and canvas

1. **Project → View / edit → New project**  
2. Search and select customer company → select contact  
3. Enter project name, currency, destination → **Create**  
4. On project detail, create a canvas and **Open** it  

### 6.4 Work on the canvas (concept → render)

1. Add nodes from the palette: Product, Supplier, Input/Generic, Pantone, Generate, Output, Action, Group.  
2. Select real product variants / images; set aliases (e.g. `@product`, `@trim`).  
3. Connect reference nodes → **Generate** → **Output**.  
4. Enter prompt (and optional structured prompt rows).  
5. Confirm generation (uses AI credits when enabled).  
6. Review Output; canvas autosaves (~600 ms) and supports explicit **Save canvas**.  

### 6.5 Send for customer approval

1. From project canvas list, click **Send**.  
2. Enter recipient email(s) (or pick from address book).  
3. Select **exactly one** render image.  
4. Click **Send report**.  
5. Canvas status becomes **awaiting_approval**.  
6. Customer opens tokenized report link and Approves or Rejects (one-time).  

### 6.6 Supplier sampling handoff

1. After status is **approved**, use **Send supplier purchase**.  
2. Suppliers receive only their relevant lines + report/QR.  
3. Track progress in **Sample Status**.  
4. Retry failed emails from Sample Status when needed.  

---

## 7. Status glossary

| Canvas / send status | Meaning |
| -------------------- | ------- |
| draft | Work in progress; not sent |
| awaiting_approval | Report emailed; waiting for customer decision |
| approved | Customer approved; purchase send unlocked |
| rejected | Customer rejected |

Sample Status stages are operational milestones after purchase (e.g. sampling, shipment, physical-sample decision). Exact stage labels appear in the Sample Status filters.

---

## 8. Button cheat-sheet (workspace)

| Area | Primary buttons |
| ---- | --------------- |
| Customer/Supplier company | Dummy input · Save and add employees |
| Employees | Dummy employees · Add more · Save/Update employees · Remove employee |
| Product form | Dummy input · Dummy parameters · Save/Update product · Choose images · Remove variant |
| Customer/Supplier records | Search · Edit · Add product · Delete (supplier) · Delete selected |
| Project list | New project · Open · Delete · Send purchase |
| New project dialog | Cancel · Create |
| Canvas list | Open · Send · Send purchase · Delete |
| Send report dialog | Select render · Send report · Cancel |
| Sample Status | Search/filter · Expand · Retry emails · Generate demo orders (local) |
| SMTP | Send test email |
| Option settings | Add · Edit · Delete · Reorder · Favorite |
| Generic node | Add · Edit · Delete · Reorder |

---

## 9. Validation & safety rules users should know

1. Company must be valid before Employee / Product mini-tabs unlock.  
2. At least one valid employee is required to fully save a customer/supplier.  
3. Product variants need image + material + color notes + unit price.  
4. Project create requires customer, contact, name, currency, and destination.  
5. Report send requires a valid email and **exactly one** selected render.  
6. Supplier purchase is available **only after approval**.  
7. Approval links are single-use.  
8. Destructive deletes always ask for confirmation.  
9. Leaving during active AI generation shows a warning.  
10. Secrets (SMTP, AI keys) never appear in browser forms—only env configuration.

---

## 10. Recommended daily workflow

```text
Settings (once)
   ↓
Customer + Supplier + Product master data
   ↓
Project → Canvas
   ↓
Connect references → Generate → Output
   ↓
Send report for approval
   ↓
On approve → Send supplier purchase
   ↓
Monitor Sample Status → retry if needed
```

---

## 11. Out of scope for current product (do not expect)

- Multiplayer live collaboration  
- Full ERP / inventory / accounting  
- Canvas version history / rollback  
- Arbitrary graph execution engines  
- Fully mobile-optimized canvas authoring  

---

## 12. Related docs

| Doc | Purpose |
| --- | ------- |
| [PRD.md](./PRD.md) | Full engineering / redevelopment PRD |
| [SETUP.md](./SETUP.md) | Environment setup |
| [email-setup.md](./email-setup.md) | SMTP configuration |
| [TESTING.md](./TESTING.md) | Test guidance |
