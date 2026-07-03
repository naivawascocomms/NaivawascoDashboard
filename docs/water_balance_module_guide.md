# NAIVAWASCO Water Balancing Module Guide

Version: 2026-05-18

Audience: Management, production engineers, distribution engineers, commercial teams, and system administrators.

## 1. Purpose of the Water Balancing Module

The water balancing module explains how water produced or transferred from production sites is attributed to distribution zones.

Its purpose is to answer questions such as:

- How much water was supplied to each zone?
- Which production site or source contributed to that zone supply?
- Where does the production-to-distribution gap appear?
- Which parts of the system are measured directly and which are allocated using an agreed engineering assumption?
- Which monthly dashboard figures are from imported historical dashboards, mock testing, or live balance calculations?

The module is an explanatory and reporting layer. It does not change the official meter readings. It uses production readings, distribution readings, billing cycles, and configured balance logic to produce source attribution and dashboard KPIs.

## 2. Core Principle

The balancing module separates two things:

1. Official measured data.
2. The engineering model used to explain how that measured water moves through the system.

Official measured data includes:

- Production volumes.
- Distribution supply volumes.
- Customer billed volumes.
- Meter readings.
- Imported historical dashboard summaries.

The balancing model explains how those figures relate to each other. It should not be used to silently overwrite readings or billing data.

## 3. Dashboard Source Policy

The system supports different dashboard sources by period:

- Historical imported dashboard data: used where old records came from already-computed dashboard summaries rather than meter readings.
- Mock balance testing: used for testing the balance model before live rollout.
- Live balance model: used after production rollout, when operational readings are expected to drive the dashboards.

Current rollout settings:

- Imported dashboard figures are authoritative through April 2026.
- May 2026 is available for balance-model testing.
- Live operational balancing starts from June 1, 2026.

This means the system can preserve historical dashboard data while still allowing engineers to test and improve the balance models before rollout.

## 4. Main Concepts

The configurable water balance is built from four main concepts:

1. Models.
2. Rules.
3. Nodes.
4. Inputs.

These work together to describe how water reaches a zone and how its source mix should be calculated.

## 5. What a Water Balance Model Is

A water balance model is the active configuration for one distribution zone over a given date range.

In simple terms, a model answers:

"For this zone, during this period, what logic should the system use to explain the source of its supplied water?"

Each active model belongs to one zone. Examples:

- CBD balance model.
- Lakeview balance model.
- Kayole balance model.
- Maai-Mahiu balance model.
- Hells Gate balance model.

A model has:

- A zone.
- A name.
- An effective start date.
- An optional effective end date.
- An active or inactive status.
- Notes.

The effective dates are important because the network changes over time. A model can remain active for many years, but if the physical network changes, a new model should be created with a new start date instead of changing old history.

## 6. When to Create a New Model

Create a new model when the engineering logic changes materially, for example:

- A zone begins receiving water from a new source.
- A bulk meter is installed or removed.
- A major valve or pipeline change permanently changes the flow path.
- A zone is split or merged.
- A production source is no longer used for that zone.

Do not create a new model every month just because the billing dates changed. Monthly opening and closing dates are handled by zone billing cycles, not by creating new water balance models.

## 7. What Rules Stand For

Rules are the instructions inside a water balance model.

Each rule says:

"This production site contributes to this zone using this method."

A rule usually includes:

- Production site.
- Route name.
- Method.
- Basis value.
- Water meter, if the method uses a meter.
- Mixing node, if the method uses a common tank or shared node.
- Confidence level.
- Priority.
- Effective dates.

Rules are evaluated day by day. This allows the system to handle a month where different days may have different active configurations.

## 8. Main Rule Methods

### Metered Volume

Use this when the zone supply from a source is directly measured by a meter.

Example:

- Hells Gate receives water from NIP.
- The Hells Gate meter at Kijabe measures the supplied volume.
- The rule uses that meter directly.

This is the strongest method when the meter is reliable.

### Mixing Node Share

Use this when water enters a common tank or distribution point from multiple sources, and zones receive water from that combined pool.

Example:

- CBD, Kihoto, and CCCR receive water through the CBD/common distribution tank.
- The tank receives inputs from DTI, AIC, and Police Line.
- The system calculates the ratio of those inputs.
- CBD, Kihoto, and CCCR use those ratios for source attribution.

This method is useful when the final zone supply is known, but the source mix must be allocated from measured tank inputs.

### Fixed Percentage

Use this when a stable percentage split has been approved.

Example:

- A zone is agreed to receive 70% from one source and 30% from another.

This should be used only where the percentage is a defensible engineering assumption.

### Fixed Weight

Use this when sources should share remaining water proportionally, but the values are weights rather than exact percentages.

Example:

- Source A has weight 2.
- Source B has weight 1.
- Source A receives two-thirds of the allocation and Source B receives one-third.

### Manual Override

Use this only for exceptional cases where a known volume must be entered manually.

Manual override should be documented clearly because it bypasses normal meter-based or model-based logic.

## 9. What Nodes Stand For

A node represents a point in the water network used for source attribution.

Common examples:

- A common distribution tank.
- A mixing point.
- An intermediary transfer point.
- A production site represented as a balancing point.

Nodes help the system model cases where water from several sources mixes before reaching zones.

Node types include:

- Production site.
- Mixing node.
- Intermediary node.

## 10. What Inputs Stand For

Inputs are the water sources entering a node.

For example, the CBD common tank has inputs from:

- DTI.
- AIC.
- Police Line.

Inputs tell the system how much each source contributed to the node on a given day.

Input methods include:

- Site production: use the production site daily production.
- Metered transfer: use a specific transfer meter.
- Residual: use the remaining difference where one source is not directly metered.

Inputs are what allow the system to calculate ratios for mixing-node rules.

## 11. Example: CBD, Kihoto, and CCCR

CBD, Kihoto, and CCCR are more complex zones because water comes from three primary sites:

- DTI.
- Police Line.
- AIC.

For Kihoto and CCCR, water first passes through CBD or the common CBD distribution tank.

The practical supply relationship is:

CBD supply = DTI inlet + AIC + Police Line - Kihoto - CCCR.

For source attribution, the system uses the ratios of the tank inputs. If on a given day:

- DTI contributes 50%.
- AIC contributes 30%.
- Police Line contributes 20%.

Then CBD, Kihoto, and CCCR use that same ratio for source attribution because their water comes from the same common pool.

## 12. Example: Direct DTI Zones

Some zones are simple because their supply is metered directly and comes from DTI.

Examples:

- Kabati.
- Site and Services.
- Consolata.

For these zones, the model can use direct metered volume rules.

The rule is simple:

Zone supply = the relevant DTI supply meter volume.

## 13. Example: Production Equals Supply Zones

For some zones, the production meter is also treated as the supply meter.

Examples:

- Kamere.
- Gondi.
- Nyonjoro.
- Kinungi.
- Ihindu.

For Ihindu, the system treats Ihindu as one zone, with supply coming from the combined Ihindu 1 and Ihindu 2 boreholes where applicable.

## 14. Example: Hells Gate and Longonot

Hells Gate and Longonot are straightforward NIP-fed zones.

- Hells Gate supply is measured by the Hells Gate meter at Kijabe.
- Longonot supply is measured by the Longonot main meter.

Each zone uses its own direct supply meter from NIP.

## 15. Example: Maai-Mahiu

Maai-Mahiu receives water from:

- Maai-Mahiu production site / Gathima borehole.
- NIP.

NIP supply to the area is measured through sections such as:

- Ngujiri.
- Karima.
- Narok Water.
- Dryport.

The local Gathima borehole uses production equals supply. NIP contributions are attributed through the relevant metered sections.

## 16. Billing Cycles and Opening/Closing Dates

Opening and closing dates are the main monthly variables users should manage.

The model itself should usually remain permanent. The dates change monthly.

The system supports open cycles:

- Opening date is set at the start of the period.
- Closing date can remain blank while the cycle is active.
- Dashboards calculate from opening date up to today.
- When the end user enters the closing date, the cycle is finalized.
- The next cycle opens automatically from closing date plus one day.

This supports daily dashboard population while keeping monthly billing periods flexible.

## 17. How Dashboard Calculations Work

For live balance periods, the system:

1. Reads the active zone billing cycle.
2. Resolves the start and end date.
3. Reads daily production and daily distribution figures.
4. Applies the active balance model for each zone.
5. Applies the rules inside the model.
6. Evaluates nodes and inputs where mixing is involved.
7. Produces zone supply, source attribution, production KPIs, distribution KPIs, and NRW indicators.

For historical imported periods, the system uses imported monthly dashboard figures instead of trying to reconstruct daily meter readings that may not exist.

## 18. What Management Should Monitor

Management should monitor:

- Total water produced.
- Water available for sale.
- Zone supplied volume.
- Billed volume.
- NRW volume and percentage.
- Source attribution by zone.
- Transmission or production-to-distribution gap.
- Whether the dashboard source is historical import, mock testing, or live balance model.
- Zones with missing or inactive balance models.
- Warnings from missing meters, missing readings, or zero input totals.

## 19. What Engineers Should Maintain

Engineers should maintain:

- Active water balance models per zone.
- Correct source rules.
- Correct water meters on metered rules.
- Correct nodes and node inputs.
- Effective dates when configurations change.
- Meter operational status records.
- Monthly opening and closing dates.

Engineers should avoid editing old active models in a way that changes historical results. If the network changes, create a new effective-dated model.

## 20. Common Warnings and What They Mean

No active water balance model:

- The zone has supply data, but no model exists for that date.
- Create or activate a model for the zone.

No active rules:

- A model exists, but it has no valid active rules for that date.
- Add rules or check rule effective dates.

Node inputs total zero:

- A mixing node was used, but its inputs produced no volume.
- Check production readings, transfer meters, and input configuration.

Direct allocations exceed zone supply:

- Metered or manual allocations are greater than the zone's official supply.
- Check meter readings, allocation method, and whether the zone supply meter is correct.

## 21. Good Configuration Practice

Use direct meter rules where the supply path is directly metered.

Use mixing nodes where water is combined before it reaches multiple zones.

Use fixed percentages only where there is an approved engineering basis.

Use manual overrides sparingly and document the reason.

Keep model names clear and zone-specific.

Keep route names meaningful, for example:

- DTI direct.
- AIC via CBD tank.
- NIP through Longonot main.
- Karima from NIP.

## 22. Monthly Operating Procedure

At the beginning of a new cycle:

1. Confirm that the previous cycle has been closed.
2. Confirm that the new cycle opening date is correct.
3. Leave closing date blank while the cycle is active.
4. Confirm all expected meters are assigned and active.

During the month:

1. Enter or sync daily production readings.
2. Enter or sync daily distribution readings.
3. Review balance warnings.
4. Investigate missing or abnormal meter readings.

At month end:

1. Enter the closing date.
2. Review dashboard totals.
3. Review source attribution and NRW.
4. Confirm imported/manual adjustments if any.
5. Finalize the cycle.

## 23. Summary

The water balancing module is the bridge between production, distribution, and commercial reporting.

It allows NAIVAWASCO to preserve historical dashboard figures where only computed summaries exist, test new balance models safely, and move into a live operational model from the rollout date.

The most important rule is simple:

Meter readings and dashboard imports are the data. Water balance models explain and attribute that data.

