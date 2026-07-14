# Product Requirements Document: Infinite Canvas Studio

> Reverse-engineered product and redevelopment specification
>
> Document version: 2.0
>
> Status: Implementation baseline
>
> Last updated: 2026-07-14
>
> Primary audience: Product managers, UX/UI designers, software architects, frontend and backend engineers, QA engineers, and DevOps engineers

---

## 1. Document Purpose

This document defines the current product behavior and redevelopment requirements for **Infinite Canvas Studio**, a browser-based workspace for apparel and soft-goods product development. The application combines structured customer, supplier, product, and project records with a visual node-based canvas for assembling references, generating images with AI, documenting decisions, requesting customer approval, and issuing supplier sampling instructions.

This PRD is intended to let a separate development team understand, estimate, redesign, and rebuild the product without relying on undocumented knowledge from the original authors.

The document uses the following requirement status terms:

- **Implemented baseline**: behavior confirmed in the current repository and required for functional parity.
- **Parity requirement**: behavior a redevelopment must preserve even if its internal implementation changes.
- **Recommended**: a product or engineering improvement that is not consistently present in the current build.
- **Out of scope**: functionality intentionally excluded unless a later product decision adds it.

When this PRD conflicts with executable source code, the source code describes the current build, while this document describes the intended redevelopment contract. Any conflict must be logged and resolved before implementation.

---

## 2. Executive Summary

Infinite Canvas Studio is a desktop-first product-development workspace designed around a visual canvas. Users maintain reusable business records, create customer projects, open one or more canvases, and connect typed nodes representing source images, customer products, supplier products, Pantone colors, AI generation instructions, generated outputs, and manual actions.

The product solves four connected problems:

1. **Fragmented product-development data**: customer contacts, supplier capabilities, product variants, colors, images, and commercial parameters are stored in reusable structured records.
2. **Unstructured visual communication**: a node canvas makes the relationship between product references, supplier options, color standards, AI prompts, and final renders visible.
3. **Slow concept rendering**: users can combine connected reference nodes and a structured prompt to generate a new image through a server-side AI provider.
4. **Approval and purchasing handoff**: a canvas can be turned into a report, emailed for approval, tracked as approved or rejected, and then sent to relevant suppliers for sampling.

The application supports two runtime modes:

- **Cloud mode** uses Supabase authentication, Postgres, Row Level Security, and Storage.
- **Local/demo mode** works without environment keys and persists supported data in the browser so the core product can be demonstrated offline.

---

## 3. Product Vision

Create a single visual workspace where product-development teams can move from customer brief to referenced concept, AI-assisted visualization, approval, and supplier sampling without losing the commercial and technical context behind each decision.

### 3.1 Product principles

1. **The canvas is a visual document, not an autonomous workflow engine.** Connections express relationships and generation inputs; they do not execute an arbitrary graph pipeline.
2. **Business records are reusable source data.** Customer, supplier, and product information must not be duplicated inside every project.
3. **Every generated result is traceable.** Model, prompt, reference inputs, format, resolution, duration, and creation time should remain available.
4. **Local mode is a first-class demonstration path.** Missing cloud or AI credentials must degrade gracefully rather than prevent the application from loading.
5. **External communication uses snapshots.** Approval reports preserve what was sent even if the live canvas changes later.
6. **User ownership is enforced at the data layer.** Cloud records must be isolated by authenticated user through Row Level Security.

---

## 4. Goals and Non-Goals

### 4.1 Product goals

- Centralize customer companies, contacts, suppliers, product types, product records, variants, images, and project metadata.
- Allow non-technical users to build a visual product-development board with drag-and-drop nodes and connections.
- Generate product imagery from a prompt plus up to 14 connected image or Pantone references.
- Preserve canvases automatically and explicitly, including nodes, edges, grouping, dimensions, and node-specific data.
- Produce a structured report containing project metadata, images, supplier/product details, Pantone data, prompt/output information, and a readable canvas log.
- Support an approval lifecycle of `draft`, `awaiting_approval`, `approved`, and `rejected`.
- Allow approved work to be forwarded to suppliers as purchase/sampling instructions.
- Run in both local/demo and authenticated cloud modes.

### 4.2 Success outcomes

- A new user can create foundational records and reach a working canvas without technical setup.
- A product developer can assemble and save a complete product concept without switching tools.
- A reviewer can understand and respond to a report without having an application account.
- A supplier can receive a clear sampling request containing the relevant product lines and report link.
- Reloading or reopening the application restores the latest successfully saved state.

### 4.3 Non-goals for the current product

- Arbitrary graph execution or dependency scheduling.
- Agent, loop, condition, or programmable code nodes.
- Multiplayer collaboration, comments, or presence.
- General-purpose document editing.
- Full ERP, inventory, accounting, or logistics management.
- Canvas history, branching, version comparison, or rollback.
- Organization-level roles, team permissions, or public canvas editing.
- Deployment automation and production observability dashboards.

---

## 5. Target Users and Personas

### 5.1 Product developer / merchandiser

The primary operator. Maintains customer and supplier information, builds product records, creates projects and canvases, connects references, generates visuals, and prepares approval reports.

Primary needs:

- Fast search across companies, contacts, product types, and product records.
- Clear traceability from a generated image to its references.
- Reusable data rather than repeated manual entry.
- Reliable saving and visible errors.

### 5.2 Designer / creative operator

Uses image, generic, product, supplier, Pantone, Generate, and Output nodes to create concepts.

Primary needs:

- Precise visual organization on a large canvas.
- Image preview, selection, masking, and reference aliases.
- Control over model, size/aspect, resolution, format, and prompt.
- Ability to stop generation and download results.

### 5.3 Customer reviewer / approver

Receives a secure report link and email, reviews project and canvas details, and approves or rejects the submission.

Primary needs:

- No account requirement.
- Clear identity of the project, canvas, contact, render, product details, and decision.
- A link that cannot be guessed and cannot be reused after a final decision.

### 5.4 Supplier contact

Receives approved product/sampling information by email.

Primary needs:

- Only supplier-relevant items.
- Purchase date, report link, QR code, product lines, and clear requested action.
- Stable reference sequence for follow-up.

### 5.5 Workspace administrator

Configures SMTP, currencies, destinations, address-book entries, and reusable generic image nodes.

---

## 6. Product Scope and Information Architecture

### 6.1 Primary workspace shell

The default `/` experience is a full-height application shell with:

- A collapsible left sidebar.
- Expandable sections for Customer, Product, Supplier, Project, and Settings.
- A tab strip allowing multiple functional areas to remain open.
- A main content region that changes according to the active tab.
- Runtime indicators showing `Cloud sync` or `Local mode`, and `AI enabled` or `AI disabled`.

Sidebar structure:

| Section  | Child actions / pages                                                   |
| -------- | ----------------------------------------------------------------------- |
| Customer | New; View / edit                                                        |
| Product  | New; View / edit                                                        |
| Supplier | New; View / edit                                                        |
| Project  | View / edit                                                             |
| Settings | SMTP setting; Currency; Destination country; Address book; Generic node |

The shell must preserve the currently selected project and canvas while the Project tab remains open. Closing the Project tab resets that in-memory selection.

### 6.2 Direct routes

| Route                               | Purpose                                    | Access expectation                                                       |
| ----------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| `/`                                 | Integrated workspace shell                 | Public in local mode; cloud deployment may require authentication policy |
| `/login`                            | Email/password login                       | Public                                                                   |
| `/signup`                           | Account registration                       | Public                                                                   |
| `/projects`                         | Standalone project list                    | Protected in cloud mode; available in demo mode                          |
| `/projects/:id`                     | Project details and canvases               | Protected in cloud mode                                                  |
| `/projects/:id/canvases/:canvasId`  | Full canvas editor                         | Protected in cloud mode                                                  |
| `/canvas-sends/:sequence?token=...` | Public read-only report snapshot           | Token-protected                                                          |
| `/recovery`                         | Import locally stored data into cloud mode | Intended for authenticated migration/recovery flow                       |

### 6.3 Responsive intent

The workspace is desktop-first. On medium and larger screens, the sidebar and content are arranged horizontally. On smaller screens, the shell can stack vertically, but complex canvas authoring should be treated as limited rather than fully mobile-optimized.

Parity requirements:

- No horizontal page overflow outside intentionally scrollable tables or canvas surfaces.
- Sidebar remains collapsible and keyboard accessible.
- Dialogs, forms, and record lists remain usable at tablet widths.
- The canvas editor consumes the remaining viewport height and does not create nested full-page scrolling.

---

## 7. Core User Journeys

### 7.1 First-run local/demo journey

1. User opens the application with no environment configuration.
2. Workspace loads in `Local mode`; AI status displays `AI disabled` unless configured.
3. User creates customer, supplier, and product records.
4. User creates a project linked to a customer contact.
5. User creates and opens a canvas.
6. User adds nodes, connects them, and saves.
7. Browser reload restores supported records and canvas state from local persistence.

Acceptance criteria:

- The app must not crash because Supabase, Xiangsu, or SMTP keys are missing.
- Cloud-only or AI-only actions must explain why they are unavailable.
- Loading, empty, and error states must be rendered rather than leaving blank content.

### 7.2 Customer and contact creation

1. User opens Customer > New.
2. User enters company name, email domain suffix, and customer type.
3. User saves the company before moving to employee contacts.
4. User adds one or more employees with name, email prefix, title, and telephone.
5. Application constructs the employee email from prefix plus company domain.
6. User saves the complete record.
7. System offers the option to add a product for that customer.

### 7.3 Supplier and supplier product creation

1. User opens Supplier > New.
2. User enters company name, email domain, and one or more supported product types.
3. User adds employee contacts.
4. User saves the supplier.
5. System may offer to create a product owned by that supplier.

### 7.4 Project creation

1. User opens the Project area and chooses New project.
2. User fuzzy-searches and selects a customer company.
3. User selects a customer employee/contact; if exactly one exists, it is selected automatically.
4. User enters a project name.
5. User selects configured currency and destination country values.
6. System snapshots customer/contact metadata into the project record.
7. User is taken to project details and can create canvases.

### 7.5 Canvas concept generation

1. User opens a project canvas.
2. User drags or clicks nodes from the palette.
3. User selects customer product, supplier product, input images, generic references, and Pantone colors.
4. User assigns meaningful aliases such as `@product`, `@trim`, or `@pantone-red`.
5. User connects reference nodes to a Generate node and connects Generate to an Output node.
6. User enters a free-text prompt and/or structured prompt rows.
7. User selects provider/model options, output size, resolution, and format.
8. User confirms generation because the action may use API credits and may replace an existing output.
9. Generate and Output nodes display loading state.
10. On success, the result is persisted, written into the connected Output node, and added to Renders.
11. On failure, both nodes show an error while existing canvas content remains intact.

### 7.6 Approval and supplier handoff

1. User opens Send canvas report.
2. User enters a valid recipient email and selects exactly one render image for the report.
3. System creates a unique sequence and approval token, builds the snapshot report, creates report/approve/reject URLs, and generates a QR code.
4. System emails the report and PDF where PDF generation succeeds.
5. Canvas status becomes `awaiting_approval`.
6. Reviewer opens the tokenized link and approves or rejects.
7. The response is persisted and the link is deactivated for further decisions.
8. If approved, the operator can send purchase/sampling emails to suppliers represented in the canvas.

---

## 8. Functional Requirements

### 8.1 Authentication and session management

| ID       | Requirement                                                                           | Priority |
| -------- | ------------------------------------------------------------------------------------- | -------- |
| AUTH-001 | Support Supabase email/password signup and login when Supabase is configured.         | Must     |
| AUTH-002 | Refresh cloud auth sessions through server middleware/proxy handling.                 | Must     |
| AUTH-003 | Protect application routes in cloud mode and redirect unauthenticated users to login. | Must     |
| AUTH-004 | Provide sign-out and redirect to login after a cloud sign-out.                        | Must     |
| AUTH-005 | Permit demo/local operation when Supabase variables are absent.                       | Must     |
| AUTH-006 | Never expose service-role, Xiangsu, or SMTP credentials to client bundles.            | Must     |

### 8.2 Customer management

| ID      | Requirement                                                                                                             | Priority |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| CRM-001 | Create and update customer company records.                                                                             | Must     |
| CRM-002 | Require company name, normalized email domain suffix, customer type, and at least one valid employee before final save. | Must     |
| CRM-003 | Maintain ordered employee contacts with stable IDs.                                                                     | Must     |
| CRM-004 | Support record and employee fuzzy search.                                                                               | Must     |
| CRM-005 | Render record loading, empty, error, view, and edit states.                                                             | Must     |
| CRM-006 | Construct employee email from email prefix and company domain without storing a second conflicting address.             | Must     |
| CRM-007 | Permit transition from a saved customer to creation of a customer-owned product.                                        | Should   |

### 8.3 Supplier management

| ID      | Requirement                                                                                                           | Priority |
| ------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| SUP-001 | Create, update, search, select, and delete supplier records.                                                          | Must     |
| SUP-002 | Require at least one supported supplier product type.                                                                 | Must     |
| SUP-003 | Maintain one or more employee contacts using the same contact structure as customers.                                 | Must     |
| SUP-004 | Support batch supplier deletion with confirmation.                                                                    | Must     |
| SUP-005 | Deleting a supplier must not delete unrelated products; linked products become unlinked according to database policy. | Must     |
| SUP-006 | Permit transition from a saved supplier to supplier-owned product creation.                                           | Should   |

Supported supplier product types in the baseline are woven label, wash care label, hang tag, heat transfer, elastic, drawcord, metal, button, PU patch, embroidery patch, silicon patch, thread, and polybag.

### 8.4 Product management

| ID      | Requirement                                                                                                                                   | Priority |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| PRD-001 | Create and update products owned by either a customer or supplier.                                                                            | Must     |
| PRD-002 | Link each product to exactly one owner kind and the corresponding owner record.                                                               | Must     |
| PRD-003 | Capture product type, internal subject/code, detailed specification, and one or more variants.                                                | Must     |
| PRD-004 | Each variant supports ordered position, material, color notes, type-specific parameters, unit price, price unit, and optional image metadata. | Must     |
| PRD-005 | Support customer garment categories covering tops, bottoms, whole-body garments, outerwear, innerwear, and functional/special wear.           | Must     |
| PRD-006 | Render type-specific parameter templates and preserve unknown-but-valid parameter keys during normalization.                                  | Must     |
| PRD-007 | Allow image upload and selection from a reusable product image browser.                                                                       | Must     |
| PRD-008 | Validate product input with Zod before persistence.                                                                                           | Must     |

### 8.5 Projects and canvases

| ID       | Requirement                                                                                     | Priority |
| -------- | ----------------------------------------------------------------------------------------------- | -------- |
| PROJ-001 | List, search, create, open, update, and delete projects.                                        | Must     |
| PROJ-002 | Store project name, optional description, customer/contact snapshot, currency, and destination. | Must     |
| PROJ-003 | Show useful project metadata in list and detail views.                                          | Must     |
| PROJ-004 | List, create, rename, open, and delete canvases within a project.                               | Must     |
| PROJ-005 | Display canvas status and relevant actions in project/canvas lists.                             | Must     |
| PROJ-006 | Deleting a project must cascade to its canvases and owned child data.                           | Must     |
| PROJ-007 | Destructive actions require explicit confirmation.                                              | Must     |

### 8.6 Canvas editor

| ID      | Requirement                                                                                                                             | Priority |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| CAN-001 | Provide an infinite pan/zoom canvas using typed nodes and edges.                                                                        | Must     |
| CAN-002 | Provide dotted background, zoom controls, fit-view behavior, and pannable/zoomable minimap.                                             | Must     |
| CAN-003 | Add nodes by palette click or drag-and-drop at the intended canvas position.                                                            | Must     |
| CAN-004 | Avoid placing newly created nodes directly on top of existing nodes where a nearby free location exists.                                | Should   |
| CAN-005 | Support node movement, resizing, selection, partial marquee selection, keyboard deletion, and edge deletion.                            | Must     |
| CAN-006 | Support loose-direction connections with visible input/output ports and bezier edges.                                                   | Must     |
| CAN-007 | Highlight related nodes and edges on hover and show animated flow for active relationships while respecting reduced-motion preferences. | Should   |
| CAN-008 | Autosave graph changes after approximately 600 ms of inactivity.                                                                        | Must     |
| CAN-009 | Also provide explicit Save canvas with editable canvas name.                                                                            | Must     |
| CAN-010 | Provide Delete all with confirmation and disabled state on an empty canvas.                                                             | Must     |
| CAN-011 | Warn before leaving when an AI generation request is active.                                                                            | Must     |
| CAN-012 | Render loading, not-found/error, and usable empty-canvas states.                                                                        | Must     |
| CAN-013 | Keep pure graph normalization, validation, serialization, and placement logic separate from UI components.                              | Must     |

### 8.7 Grouping behavior

| ID      | Requirement                                                                                               | Priority |
| ------- | --------------------------------------------------------------------------------------------------------- | -------- |
| GRP-001 | Create a named group from multiple selected nodes.                                                        | Must     |
| GRP-002 | Assign a distinguishable group accent color and visually associate children.                              | Must     |
| GRP-003 | Preserve absolute child positions when adding to, leaving, disassembling, or deleting a group.            | Must     |
| GRP-004 | Resize the group rectangle to fit its members with padding.                                               | Must     |
| GRP-005 | Confirm ambiguous drag actions that add a node to or remove a node from a group.                          | Must     |
| GRP-006 | Support batch-connect and batch-disconnect behavior without allowing a group to connect to its own child. | Must     |

### 8.8 Image generation

| ID      | Requirement                                                                                                    | Priority |
| ------- | -------------------------------------------------------------------------------------------------------------- | -------- |
| GEN-001 | Send generation requests only through a server-side route.                                                     | Must     |
| GEN-002 | Require a non-empty prompt with a maximum of 2,000 characters.                                                 | Must     |
| GEN-003 | Support zero to 14 validated references.                                                                       | Must     |
| GEN-004 | References may be images with alias and URL, or Pantone references with alias, label, and six-digit HEX color. | Must     |
| GEN-005 | Require a connected Output node before generation begins.                                                      | Must     |
| GEN-006 | Support square, landscape, and portrait sizes: `1024x1024`, `1536x1024`, and `1024x1536`.                      | Must     |
| GEN-007 | Support PNG, JPEG, and WebP output formats.                                                                    | Must     |
| GEN-008 | Support preview/1K-equivalent, 2K, and 4K resolution selection where the selected model permits it.            | Must     |
| GEN-009 | Prevent unavailable or incompatible model/reference combinations and explain the reason.                       | Must     |
| GEN-010 | Ask for confirmation before consuming API credits or replacing an existing output.                             | Must     |
| GEN-011 | Allow an active generation request to be stopped through either Generate or connected Output node.             | Must     |
| GEN-012 | Ignore stale or superseded generation responses.                                                               | Must     |
| GEN-013 | Persist a successful generated image and its metadata before treating the operation as complete.               | Must     |
| GEN-014 | Display success and error feedback in the node and a global toast.                                             | Must     |

The baseline model catalog includes GPT Image, DALL-E, and Gemini image identifiers. The UI distinguishes current, legacy, enabled, and disabled models. A redevelopment should read model availability from a server-owned configuration rather than assuming every catalog entry is operational.

### 8.9 Reporting, approval, and purchasing

| ID      | Requirement                                                                                                                                                                | Priority |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| REP-001 | Build a deterministic report from the live canvas and project snapshot.                                                                                                    | Must     |
| REP-002 | Report sections may include selected render, customer products, supplier breakdowns, Pantone swatches, generic nodes, output/prompt details, and chronological canvas log. | Must     |
| REP-003 | Require exactly one selected render image before sending an approval report.                                                                                               | Must     |
| REP-004 | Validate recipient addresses and support reusable address-book options.                                                                                                    | Must     |
| REP-005 | Create a unique human-readable sequence and cryptographically strong approval token.                                                                                       | Must     |
| REP-006 | Store a report snapshot separately from the mutable live canvas.                                                                                                           | Must     |
| REP-007 | Generate report, approval, and rejection URLs plus QR code.                                                                                                                | Must     |
| REP-008 | Send an HTML/text email and attach a PDF report when PDF rendering succeeds.                                                                                               | Must     |
| REP-009 | If optional PDF generation fails, send the report content with a visible operational warning instead of silently losing the entire send.                                   | Should   |
| REP-010 | Public report access requires both sequence and token.                                                                                                                     | Must     |
| REP-011 | Approval/rejection updates both send status and canvas status atomically.                                                                                                  | Must     |
| REP-012 | A completed approval token cannot be used for a second state transition.                                                                                                   | Must     |
| REP-013 | Supplier purchase/sampling actions become available only after approval.                                                                                                   | Must     |
| REP-014 | Supplier emails contain only relevant supplier/product lines, purchase date, report URL, and QR code.                                                                      | Must     |

### 8.10 Settings

| ID      | Requirement                                                                                    | Priority |
| ------- | ---------------------------------------------------------------------------------------------- | -------- |
| SET-001 | Display SMTP configuration status without exposing credentials.                                | Must     |
| SET-002 | Allow a test email to be sent to a validated recipient.                                        | Must     |
| SET-003 | Maintain ordered, favoritable currency options.                                                | Must     |
| SET-004 | Maintain ordered, favoritable destination-country options.                                     | Must     |
| SET-005 | Maintain ordered reusable address-book recipients.                                             | Must     |
| SET-006 | Maintain ordered generic node definitions with name and multiple images.                       | Must     |
| SET-007 | Allow generic definitions to be created, updated, deleted, and reordered.                      | Must     |
| SET-008 | Canvas palette must display current generic definitions with loading, empty, and error states. | Must     |

### 8.11 Recovery

| ID      | Requirement                                                                                           | Priority    |
| ------- | ----------------------------------------------------------------------------------------------------- | ----------- |
| REC-001 | Detect locally stored projects, canvases, images, and workspace records eligible for recovery.        | Must        |
| REC-002 | Require authentication and configured Supabase before cloud import.                                   | Must        |
| REC-003 | Validate the entire import payload at the API boundary.                                               | Must        |
| REC-004 | Preserve parent-child relationships while assigning cloud IDs.                                        | Must        |
| REC-005 | Return a clear import summary and actionable partial-failure errors.                                  | Must        |
| REC-006 | Never delete local source data automatically after import; user confirmation is required for cleanup. | Recommended |

---

## 9. Canvas Node Specification

### 9.1 Node registry contract

Every registered node type must be defined once in a central registry with at least:

- Stable type identifier.
- User-facing label and description.
- Palette visibility.
- Default data factory.
- Typed node data interface.
- Render component.
- Input/output port rules.
- Validation and normalization behavior.
- Serialization compatibility behavior.

No feature should hard-code a parallel list of node types without a documented reason.

### 9.2 Baseline node types

| Type ID       | Label    | Purpose                                                                          | Key data / behavior                                                                                                                 |
| ------------- | -------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `imageInput`  | Input    | Named image reference                                                            | Alias, uploaded/saved image, storage path, generic definition snapshot, selected generic image, named mask regions                  |
| `generate`    | Generate | AI image generation controller                                                   | Prompt, structured prompt rows, model, size, format, resolution, references, status, result/error                                   |
| `imageOutput` | Output   | Generated result                                                                 | Result URL, prompt/model metadata, output format, generation duration, created time, loading/error/done state, preview and download |
| `suppler`     | Supplier | Supplier-product reference; identifier retains legacy spelling for compatibility | Alias, product type, supplier, product, variant, selected image, masks                                                              |
| `product`     | Product  | Customer-product reference                                                       | Alias, customer, product, variant, selected image, masks                                                                            |
| `action`      | Action   | Manual workflow note                                                             | Title, notes, status of manual/queued/done                                                                                          |
| `pantone`     | Pantone  | Searchable color-standard reference                                              | Alias, query, code, name, HEX, catalog and catalog filter, copy HEX                                                                 |
| `group`       | Group    | Visual and logical container                                                     | Label, color, dimensions, parent/child positioning, batch connection actions                                                        |
| `note`        | Note     | Free-form rich text note                                                         | Text and dimensions; currently registry-supported but hidden from default palette                                                   |
| `image`       | Image    | Basic image display                                                              | URL, alt text, dimensions; currently registry-supported but hidden from default palette                                             |

### 9.3 Generic nodes

Generic nodes are reusable Input-node presets configured in Settings. Each definition contains a name, sort order, and one or more images. When inserted into a canvas, the definition name and images are snapshotted into the node so later definition edits do not unexpectedly rewrite an existing canvas.

### 9.4 Image masking

Image-bearing Input, Product, and Supplier nodes may define multiple named mask regions. Each region contains freehand strokes, each stroke contains a thickness and ordered points. Generate structured prompt rows can refer to the selected source alias and one of its named masks.

Masking parity requirements:

- Add, rename, edit, and remove mask regions without losing the source image.
- Store mask coordinates in image-relative space so resizing a node does not alter the intended region.
- Clearing or replacing an image clears incompatible masks.
- Mask editing remains keyboard-dismissible and does not trap focus incorrectly.

### 9.5 Structured prompt rows

A Generate node can build prompt phrases using:

`@source` + `use mask [name]` + `change [texture|color|density|object]` + `to @target`

The UI shows a readable preview for each row and combines rows with the free-text prompt for generation. Alias suggestions come from currently connected references. Mask options are restricted to the selected source reference.

---

## 10. Data Model

### 10.1 Primary entities

| Entity                  | Important fields                                                                | Relationships                        |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------------------ |
| Profile                 | user ID, email, display name                                                    | One per auth user                    |
| Customer                | company name, email domain, type, timestamps                                    | Owns employees and customer products |
| Customer employee       | stable local ID, name, email prefix, title, telephone, order                    | Belongs to customer                  |
| Supplier                | company name, email domain, product types, timestamps                           | Owns employees and supplier products |
| Supplier employee       | stable local ID, name, email prefix, title, telephone, order                    | Belongs to supplier                  |
| Product                 | owner kind, supplier/customer ID, optional project ID, type, subject, detail    | Owns ordered variants                |
| Product variant         | material, color notes, parameters, price, image metadata, order                 | Belongs to product                   |
| Project                 | owner user, name, description, customer/contact snapshot, currency, destination | Owns canvases                        |
| Canvas                  | project ID, name, content snapshot, lifecycle status, timestamps                | Owns nodes, edges, images, sends     |
| Canvas node             | canvas ID, node type, position, dimensions/data, parent relationship            | Belongs to canvas                    |
| Canvas edge             | canvas ID, source/target handles, edge metadata                                 | Belongs to canvas                    |
| Image                   | optional canvas ID, source, URL/path, prompt/model metadata                     | Upload or generated asset            |
| Canvas send             | sequence, status, recipient, token, URLs, selected render IDs, report snapshot  | Belongs to canvas                    |
| Workspace option        | kind, code, name, optional symbol, favorite, sort order                         | User-owned setting                   |
| Generic node definition | name, ordered images, sort order                                                | User-owned setting                   |

### 10.2 Persistence modes

All UI and hooks must depend on interfaces rather than a concrete storage implementation.

**Cloud implementation**:

- Supabase browser/server clients.
- Postgres tables with RLS.
- Storage for durable images.
- Transactional or RPC-based multi-table updates where atomicity matters.

**Local implementation**:

- Browser local storage for demo data.
- Data must be normalized and validated on read because users or older builds can leave malformed values.
- Feature behavior should match cloud mode where external services are not intrinsically required.

### 10.3 Ownership and deletion rules

- All private cloud records include or inherit authenticated user ownership.
- Projects cascade to canvases; canvases cascade to graph rows and canvas sends.
- Supplier deletion must not delete all product history accidentally; foreign keys should unlink where appropriate.
- Report snapshots remain immutable historical evidence even if source records are later edited.
- Public approval functions expose only the minimum fields required for tokenized review.

### 10.4 Compatibility

- Existing node type IDs and persisted field names are migration-sensitive.
- The legacy `suppler` type ID must remain readable until a formal data migration changes stored canvases to `supplier`.
- Unknown optional fields should be preserved when safe so newer canvas data is not destroyed by an older client.
- Schema changes require a migration, normalization logic, and regression tests.

---

## 11. API and Integration Requirements

### 11.1 `POST /api/generate`

Request:

- `model`: supported image model ID.
- `prompt`: 1-2,000 characters.
- `size`: supported output size.
- `outputFormat`: `png`, `jpeg`, or `webp`.
- `resolution`: `preview`, `2K`, or `4K`.
- `references`: maximum 14 image/Pantone discriminated-union objects.

Responses:

- `200`: validated generation response containing URL and model.
- `400`: malformed JSON or invalid request.
- `503`: image generation is not configured.
- `502`: upstream provider error, timeout, invalid response, or failed generation.

Requirements:

- Validate request and upstream response with Zod.
- Honor request cancellation.
- Apply provider timeouts and return sanitized errors.
- Never return provider credentials or raw sensitive upstream diagnostics.

### 11.2 Email endpoints

Baseline endpoints:

- `POST /api/email/test`
- `POST /api/email/send`
- `POST /api/email/report`
- `POST /api/email/purchase-sampling`

Requirements:

- Use shared route-handler behavior for JSON parsing, schema validation, authorization, error normalization, and delivery.
- Keep SMTP credentials server-only.
- Validate all recipients and request-specific payloads.
- Return service-unavailable responses when SMTP is not configured.
- Avoid logging email bodies, tokens, or credentials in production.

### 11.3 `GET /api/canvas-sends/respond`

Input query:

- `token`: approval token.
- `decision`: `approved` or `rejected`.

Requirements:

- Validate token and decision.
- Hash or otherwise protect stored tokens in a production redevelopment.
- Perform a single-use atomic state transition.
- Update corresponding canvas state.
- Return a clear human-readable success or invalid-link response.

### 11.4 `POST /api/recovery/import`

Requirements:

- Require authenticated cloud user.
- Validate nested local export.
- Import parent entities before dependent entities.
- Re-map IDs and preserve relationships.
- Return imported counts and failures without leaking internal credentials.

### 11.5 Xiangsu AI

- Called only from the server.
- Model-specific request translation occurs in a dedicated client module.
- Response variants and provider errors are normalized into the application contract.
- HTTP(S) and data URLs are accepted as references; durable production usage should prefer storage URLs over large inline data URLs.

### 11.6 Supabase

- Browser client uses only public/publishable credentials.
- Server client handles SSR cookies and authenticated access.
- Service-role access, if required for a narrowly scoped operation, stays in server-only code.
- RLS is enabled on user-owned tables.
- SQL functions used for public approval must validate token and state internally and expose only required data.

---

## 12. UI/UX Requirements

### 12.1 Visual language

The baseline design is a restrained professional studio interface:

- Geist sans-serif typography.
- Cool neutral background and card surfaces.
- Teal/blue primary accent.
- Compact 8 px base radius.
- Light borders and restrained shadows.
- Theme tokens support light and dark palettes.
- Lucide icons and shadcn/Radix primitives.

Redevelopment may refine the brand, but information density, hierarchy, state clarity, and accessibility must not regress.

### 12.2 Interaction feedback

Every asynchronous action must provide:

- Disabled or pending control state.
- Visible progress text or spinner.
- Success feedback.
- Actionable error feedback.
- Protection against duplicate submission.

Autosave must be unobtrusive. Repeated failures should be surfaced without producing a toast for every keystroke.

### 12.3 Empty and error states

Required examples include:

- No open workspace tab.
- No customer/supplier/product/project/canvas records.
- No generic nodes.
- No render images.
- No canvas report steps.
- AI disabled.
- SMTP disabled.
- Failed record/canvas/settings load.
- Invalid or expired public approval link.

### 12.4 Destructive operations

Confirm before:

- Deleting suppliers, projects, canvases, nodes where context may be lost, all canvas content, generic definitions, images, or connections with non-obvious impact.
- Replacing an existing generated output.
- Disassembling a group or changing group membership when drag intent is ambiguous.

### 12.5 Accessibility

- All interactive controls must be reachable by keyboard.
- Icon-only buttons require accessible names and visible tooltips where meaning is not obvious.
- Focus must move into dialogs and return to the trigger on close.
- Form fields require persistent labels; placeholder text is not a label.
- Status must not be communicated by color alone.
- Text and controls must meet WCAG 2.2 AA contrast targets.
- Canvas keyboard deletion must not fire while focus is inside a text input/editor.
- Animated edge flow must stop when `prefers-reduced-motion` is enabled.
- Public reports must use semantic headings, lists, tables, alt text, and readable link labels.

---

## 13. Security and Privacy Requirements

| ID      | Requirement                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-001 | Validate environment variables once in a server-safe configuration module.                                                           |
| SEC-002 | Validate every client/server, server/provider, storage, and persisted-data boundary.                                                 |
| SEC-003 | Never expose `XIANGSU_API_KEY`, Supabase service-role keys, or SMTP passwords to the browser.                                        |
| SEC-004 | Enforce RLS ownership for all user-private Supabase tables.                                                                          |
| SEC-005 | Tokenized public report endpoints must return no data when sequence/token validation fails.                                          |
| SEC-006 | Approval tokens must be high entropy, single-use, and stored as hashes in a hardened redevelopment.                                  |
| SEC-007 | Sanitize user-controlled values in generated HTML email and report content.                                                          |
| SEC-008 | Restrict image uploads by size, MIME type, and decodability; do not trust file extensions.                                           |
| SEC-009 | Apply rate limits to generation, email, public response, and recovery endpoints in production.                                       |
| SEC-010 | Avoid logging secrets, public tokens, full customer data, or generated-image data URLs.                                              |
| SEC-011 | Use CSRF-resistant patterns for authenticated mutations and SameSite secure cookies.                                                 |
| SEC-012 | Define retention and deletion policy for customer data, report snapshots, generated images, and email logs before production launch. |

---

## 14. Non-Functional Requirements

### 14.1 Performance

- Initial workspace interaction should be available within 3 seconds on a typical business laptop and broadband connection, excluding first-time framework compilation in development.
- Record search/filter interactions should respond within 100 ms for 1,000 local records.
- Canvas pan and zoom should remain visually responsive at 60 fps for a normal board of 100 nodes and 150 edges.
- Autosave must debounce rapid edits and avoid overlapping saves for the same canvas.
- Large images should be thumbnail-optimized in lists and node previews.
- Public report pages should not require loading the full editor bundle.

### 14.2 Reliability

- A failed AI call must not corrupt the graph or remove the last successful render.
- Stale asynchronous responses must not overwrite newer user choices.
- Save operations must be idempotent where practical.
- Cloud multi-table updates must be transactional when partial writes would create invalid records.
- Local data readers must tolerate older or malformed optional fields through safe normalization.

### 14.3 Scalability targets

Initial redevelopment targets:

- 10,000 private records per user across customers, suppliers, and products.
- 1,000 projects per user.
- 500 canvases per project as a storage limit, with paginated UI well before that number.
- 500 nodes and 1,000 edges per canvas as a supported hard test case.
- Storage and report generation designed so images are referenced rather than embedded as large base64 payloads whenever possible.

### 14.4 Maintainability

- TypeScript strict mode; no `any`.
- Zod validation at all external boundaries.
- UI components remain presentational with thin hooks.
- Persistence is accessed through `CanvasStore` and `WorkspaceRecordStore` interfaces.
- Pure functions cover validation, normalization, report construction, prompt construction, graph adapters, and placement.
- Reusable UI is extracted instead of duplicated.
- Tailwind utility classes and shared theme tokens are used; no component-specific CSS modules or inline styles.

### 14.5 Compatibility

- Latest two stable versions of Chrome, Edge, Firefox, and Safari for non-canvas flows.
- Latest Chrome/Edge are the primary authoring targets for advanced canvas behavior.
- Touch support is secondary; mouse, trackpad, and keyboard are primary.

---

## 15. Analytics and Observability

Analytics are not currently a complete implemented feature. A production redevelopment should add privacy-conscious events without recording prompts, customer details, emails, or image contents by default.

Recommended product events:

- Workspace mode selected.
- Customer/supplier/product/project/canvas created.
- Node added by type.
- Connection created/deleted.
- Canvas autosave succeeded/failed.
- Generation started, stopped, succeeded, or failed, with model family and duration only.
- Report send started/succeeded/failed.
- Approval completed by decision.
- Supplier sampling send succeeded/failed.
- Recovery import succeeded/failed.

Recommended operational telemetry:

- API request count, latency, status, and sanitized error class.
- Upstream AI latency and failure class.
- SMTP delivery success/failure.
- PDF render duration and fallback rate.
- Supabase query latency and RLS/authorization failures.
- Client error boundary events and autosave failure rate.

---

## 16. Technical Architecture for Redevelopment

### 16.1 Required stack

- Next.js 16 App Router.
- React 19 and strict TypeScript.
- Tailwind CSS v4 and shadcn/ui/Radix primitives.
- `@xyflow/react` v12.
- Zustand for client canvas/UI state.
- TanStack Query v5 for asynchronous server state.
- Supabase SSR/browser clients for auth, Postgres, and Storage.
- Server-only Xiangsu REST client.
- Zod for schemas and normalization.
- Vitest for pure logic and route-handler tests.
- pnpm for package management.

### 16.2 Logical layers

1. **Presentation**: routes and reusable UI components.
2. **Client orchestration**: React Query hooks, canvas context, and Zustand state.
3. **Domain logic**: node registry, schemas, normalization, report generation, generation-run control, and commercial helpers.
4. **Persistence boundary**: store interfaces with local and Supabase implementations.
5. **Server integration**: route handlers, email delivery, PDF generation, Supabase server/service clients, and Xiangsu client.
6. **Data platform**: Supabase Auth, Postgres/RLS, and Storage.

### 16.3 Server/client rules

- Use Server Components for route-level data where this materially reduces client work.
- Mark only interactive components with `"use client"`.
- Do not import server-only modules from client dependency graphs.
- Mutations may use Route Handlers or Server Actions, but API boundaries must remain validated and testable.
- Do not import concrete store implementations outside the store selector module.

### 16.4 Suggested source layout

```text
app/
  (auth)/
  (app)/
  api/
components/
  auth/
  canvas/
  projects/
  recovery/
  settings/
  ui/
  welcome/
lib/
  email/
  hooks/
  nodes/
  store/
  supabase/
  zustand/
supabase/migrations/
docs/
```

---

## 17. Environment and Configuration

The application must validate environment variables and support partial configuration.

Configuration groups:

- Supabase public URL and publishable/anonymous key.
- Optional Supabase service-role key for server-only administrative operations.
- Xiangsu API key and optional endpoint/model configuration.
- SMTP host, port, security mode, username, password, and sender identity.
- Public application base URL for report, approval, and QR links.

Rules:

- Missing Supabase public configuration activates local/demo mode.
- Missing Xiangsu configuration disables generation and returns a clear 503 response.
- Missing SMTP configuration disables email delivery and test-email actions without exposing which credential is absent to unauthorized clients.
- Public base URL must be explicit in production; request-origin fallback is acceptable only for local development.

---

## 18. Testing and Acceptance Strategy

### 18.1 Unit tests

Required coverage areas:

- All Zod schemas and normalization fallbacks.
- Node registry completeness and palette serialization.
- Canvas graph validation, parent/child handling, and edge normalization.
- New-node placement and group geometry.
- Reference-prompt and structured prompt construction.
- Model capability, resolution, format, and reference compatibility.
- Generation-run cancellation and stale-response handling.
- Project metadata and workspace option normalization.
- Product variant normalization and pricing defaults.
- Canvas report and supplier-purchase target construction.
- Local store CRUD, cascading deletion, and migration compatibility.
- Email schema, preparation, authorization, and PDF rendering fallbacks.
- Recovery payload validation and ID mapping.

### 18.2 Integration tests

- Supabase store mapping and database/RLS behavior against a test project.
- Image upload and persisted URL flow.
- Generation route with mocked provider success, timeout, invalid response, abort, and error.
- Email endpoints with mocked transport.
- Canvas send creation, public retrieval, approval, rejection, and reuse prevention.
- Local-to-cloud recovery.

### 18.3 End-to-end tests

Minimum critical suite:

1. Signup/login/sign-out in configured mode.
2. Create customer with employee.
3. Create supplier with product types and employee.
4. Create customer and supplier products with variants/images.
5. Create a project linked to a customer contact.
6. Create and open a canvas.
7. Add, move, resize, connect, group, ungroup, and delete nodes.
8. Save, reload, and verify graph restoration.
9. Generate using connected references and verify Output/Renders metadata.
10. Stop an active generation.
11. Send report, open public snapshot, approve, and verify status.
12. Send supplier sampling email after approval.
13. Verify local/demo operation with zero keys.
14. Import local records into authenticated cloud mode.

### 18.4 Release gates

- `pnpm lint` passes.
- `pnpm test` passes.
- `pnpm build` passes with production environment validation.
- No TypeScript errors and no `any` added.
- No server secrets are present in client bundles.
- Accessibility smoke test passes for auth, records, projects, settings, report, and primary canvas actions.
- Database migrations apply cleanly to a new database and an existing baseline database.
- Manual approval-link and email-delivery test succeeds in a staging environment.

---

## 19. Redevelopment Delivery Plan

### Phase 0: Discovery and contract freeze

- Review this PRD with product owner and operations users.
- Resolve open questions in Section 22.
- Inventory existing persisted data requiring migration.
- Produce final wireframes and entity relationship diagram.
- Define acceptance fixtures for representative customer, supplier, product, and canvas data.

### Phase 1: Foundation

- Project setup, design tokens, UI primitives, environment validation, error boundaries, providers, authentication, and store interfaces.
- Supabase schema, RLS, and local persistence foundation.
- Customer, supplier, product, and workspace settings schemas.

### Phase 2: Business records and projects

- Customer/supplier/contact CRUD.
- Product/variant/image CRUD.
- Currency, destination, address-book, and generic node settings.
- Project and canvas CRUD with customer/contact snapshots.

### Phase 3: Canvas authoring

- React Flow editor, registry, palette, graph persistence, autosave, selection, connections, node resize, and grouping.
- Product, supplier, input, generic, Pantone, action, Generate, and Output nodes.
- Preview, upload, download, masking, and render gallery.

### Phase 4: AI generation

- Server-side provider client.
- Model capability UI and validation.
- Cancellation, stale request protection, durable image persistence, and metadata.

### Phase 5: Reporting and external workflows

- Report builder, log panel, PDF renderer, SMTP settings, report send dialog, secure public report, approval response, and supplier sampling email.

### Phase 6: Recovery, hardening, and launch

- Local-to-cloud recovery.
- Security review, rate limiting, performance profiling, accessibility audit, browser testing, observability, runbooks, and data-retention policy.

---

## 20. Definition of Done

A redevelopment is functionally complete when:

- All Must requirements in this PRD are implemented or explicitly waived by the product owner.
- Critical end-to-end journeys pass in local and cloud modes.
- The app starts with zero optional environment keys.
- Business records and canvas content survive reload and backend switching through the defined recovery path.
- AI generation is secure, cancellable, validated, and traceable.
- Public report approval is token-protected, single-use, and correctly updates status.
- Approved canvases can produce supplier-specific sampling communication.
- Loading, empty, error, success, and disabled states are present for every major feature.
- Accessibility, security, build, lint, and test release gates pass.
- Architecture and operational setup are documented for a team that did not write the implementation.

---

## 21. Risks and Mitigations

| Risk                                                   | Impact                                        | Mitigation                                                                              |
| ------------------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| Large base64 images inflate canvas records and reports | Slow saves, database limits, failed email/PDF | Persist assets in Storage and store URLs; generate thumbnails                           |
| Autosave races with manual save or stale state         | Lost updates                                  | Serialize saves per canvas, use revision IDs, and reject stale writes                   |
| Public approval token leakage                          | Unauthorized review/decision                  | High-entropy tokens, hashed storage, short retention, single use, audit trail           |
| AI provider model availability changes                 | Broken generation UI                          | Server-driven capability catalog and graceful unsupported-model errors                  |
| Complex canvas interactions are difficult on mobile    | Poor usability                                | Declare desktop-first support and provide read-only mobile fallback                     |
| Local and cloud implementations diverge                | Demo-only bugs or migration loss              | Shared contract tests and normalized fixtures for both stores                           |
| Supplier/customer data in email reports                | Privacy exposure                              | Explicit recipient confirmation, minimal snapshot, retention controls, secure transport |
| Legacy persisted node fields                           | Broken old canvases                           | Versioned schema migration and tolerant normalization                                   |
| Report PDF failure due to remote image format/access   | Missing attachment                            | Pre-fetch/convert supported images, size limits, visible HTML fallback                  |

---

## 22. Open Product Questions

These decisions should be answered before a production rebuild is considered complete:

1. Is `/` intentionally public in cloud deployments, or should it redirect to login like protected project routes?
2. Should customers and suppliers be global to a user, or scoped to an organization/team in the next release?
3. Is the customer `type` field free text by design, or should it use a controlled taxonomy?
4. Can a project change its linked customer/contact after creation, and should old reports retain the original snapshot?
5. Should a canvas allow multiple Generate nodes to target the same Output node?
6. Should an Output node retain previous renders as versions rather than replacing its current image?
7. Are Pantone datasets licensed and approved for redistribution in all target regions?
8. What are the upload size, pixel dimension, file count, and storage retention limits?
9. What exact expiration period applies to public report and approval links?
10. Who is allowed to resend a report after rejection, and does that create a new sequence?
11. Should supplier sampling status tracking be exposed as a complete supplier portal or remain email-centered?
12. Which model catalog entries are contractually available from Xiangsu in production?
13. Are pricing values tax-inclusive, and are exchange rates required or deliberately out of scope?
14. What audit trail and data-deletion obligations apply to customer and supplier personal data?
15. What browser/device support level is contractually required for mask drawing and canvas authoring?

---

## 23. Glossary

| Term              | Definition                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Canvas            | A saved visual board containing nodes and edges within a project.                                                           |
| Node              | A typed visual object representing an input, product, supplier selection, color, generation action, result, note, or group. |
| Edge / connection | A visual relationship between two node ports. For generation, it determines reference and output relationships.             |
| Generic node      | A reusable, settings-defined image preset inserted as an Input node snapshot.                                               |
| Reference alias   | A short name prefixed with `@` and used to identify an image or Pantone input in a prompt.                                  |
| Mask region       | A named set of strokes selecting an area of a reference image.                                                              |
| Render            | A generated image persisted in the canvas image gallery.                                                                    |
| Canvas send       | An immutable approval/report event containing recipient, sequence, tokenized URLs, selected render, and report snapshot.    |
| Local mode        | Browser-persisted demo operation without Supabase configuration.                                                            |
| Cloud mode        | Authenticated Supabase-backed persistence and storage.                                                                      |
| RLS               | Postgres Row Level Security used to isolate records by authenticated user.                                                  |

---

## 24. Current Implementation Reference

The present repository organizes the product around:

- `app/` for App Router pages and server routes.
- `components/welcome/` for the integrated workspace shell and business-record panels.
- `components/canvas/` for the canvas editor, palette, nodes, gallery, and report log.
- `components/projects/` for project/canvas lists and send/purchase actions.
- `components/settings/` for SMTP, ordered workspace options, and generic node configuration.
- `lib/nodes/` for node types, registry, palette serialization, ports, and validation.
- `lib/store/` for persistence interfaces and local/Supabase implementations.
- `lib/email/` for email schemas, delivery, authorization, and PDF report rendering.
- `supabase/migrations/` for schema, RLS, graph persistence, product variants, settings, and approval links.

This reference is informative, not a license to duplicate accidental implementation complexity. A redevelopment may change internal modules as long as the requirements, data compatibility plan, security rules, and acceptance criteria in this PRD are satisfied.
