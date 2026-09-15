# Stats

## What the application does

Stats turns archive metadata into an analysis dashboard. It is a data-derived application rather than a manually maintained list of numbers.

## Data flow

1. The current archive statistics data is fetched/loaded.
2. Volume types and metrics are normalized.
3. Derived values such as rank, percentile, cumulative pages, delays, and category breakdowns are calculated.
4. The application renders overview sections, dashboards, timelines, translation analysis, charts, comparisons, volume tables, achievements, and fun facts.

## Main analysis areas

### Overview

Summarizes archive size and the main content metrics.

### Archive effort

Compares volume/page/chapter-related workload and derived effort metrics.

### Dashboard

Presents summarized metrics for faster scanning.

### Timeline

Shows publication/archive activity over time.

### Translation

Analyzes translation timing/gaps where the dataset contains the relevant dates.

### Charts

Visualizes page counts, chapter counts, cumulative pages, delay trends, and page-vs-delay relationships.

### Compare

Lets the user choose two volumes and compare their derived metrics.

### Volumes

Provides searchable/filterable volume-level data with sorting and type filters.

### Achievements and fun facts

Turns the calculated dataset into secondary summaries and notable observations.

## Important rule

Stats values should be treated as **derived from the current archive dataset**. If source metadata changes, the dashboard can change without a code change.

## Maintenance

Whenever metadata fields used by a calculation are renamed or removed, update the corresponding calculation before updating the visual output. Validate empty/missing values so one incomplete volume does not break the entire dashboard.

## Technical implementation

Stats is a derived-data application. Source metadata is normalized before calculations run, and charts/tables consume the derived model rather than independently recomputing values. Missing dates or counts must be handled explicitly so one incomplete record does not create NaN values or break the dashboard.
