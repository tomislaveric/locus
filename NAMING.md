# Staza — Terminology Guide

## Brand

**Staza** is the active product brand. Use **STAZA** only where the existing
visual treatment calls for an uppercase wordmark.

## Canonical terms

| Term | Meaning |
|---|---|
| Activity | The canonical cross-sport domain object. It has a type, route, duration, distance, events, media, and progression result. |
| Activity type | `cycling`, `running`, `hiking`, `walking`, or `unknown`. |
| Ride | Cycling-specific presentation label for an Activity. |
| Run | Running-specific presentation label for an Activity. |
| Hike | Hiking-specific presentation label for an Activity. |
| Walk | Walking-specific presentation label for an Activity. |
| Player | Gameplay identity. |
| User | Authentication and account identity. |

Use **Activity** by default in technical names and generic product copy:
Activities, Add Activity, Recent Activities, Activity Replay, Distance, and
Duration.

When the activity type is known, use natural presentation language such as
Ride complete, Run complete, Hike complete, or Walk complete. Do not introduce
separate sport processing pipelines or infer an activity type from a filename.

## Product language

Keep copy concise, active, exploratory, and sport-neutral by default. Prefer
Activity, Explore, Discover, Collected, Progress, World, Region, Distance,
Duration, and XP. Retain cycling wording only for cycling-specific telemetry,
fixtures, or currently supported camera workflows.

## Compatibility

Existing FIT import and activity persistence remain canonical. Historical
feature/POC documentation and applied migrations may retain older terminology
where changing them would rewrite historical context or persisted contracts.
