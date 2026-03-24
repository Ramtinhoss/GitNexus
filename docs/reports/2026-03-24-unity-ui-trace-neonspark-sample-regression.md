# Unity UI Trace Neonspark Sample Regression (2026-03-24)

- Repo: `/Volumes/Shuttle/unity-projects/neonspark`
- Sample size: 20 targets
- Mode: `selector_mode=balanced`

## Summary by Goal

| Goal | Total | Non-empty | Hit Rate | not_found | ambiguous | Avg Latency (ms) |
|---|---:|---:|---:|---:|---:|---:|
| asset_refs | 6 | 6 | 100% | 0 | 0 | 26137 |
| template_refs | 8 | 8 | 100% | 0 | 0 | 731 |
| selector_bindings | 6 | 6 | 100% | 0 | 0 | 28042 |

## Samples

| Goal | Target | Results | Diagnostic | Latency (ms) |
|---|---|---:|---|---:|
| asset_refs | `Assets/NEON/VeewoUI/Uxml/Shell/Views/BanScreen.uxml` | 1 | none | 26285 |
| asset_refs | `Assets/NEON/VeewoUI/Uxml/Shell/Views/EvolutionScreenNew.uxml` | 1 | none | 26147 |
| asset_refs | `Assets/NEON/VeewoUI/Uxml/Shell/Views/IllustrationsScreenNew.uxml` | 1 | none | 25918 |
| asset_refs | `Assets/NEON/VeewoUI/Uxml/Shell/Views/DifficultyScreenNew.uxml` | 2 | none | 26960 |
| asset_refs | `Assets/NEON/VeewoUI/Uxml/Shell/Views/AssaultModeLevelScreen.uxml` | 1 | none | 25789 |
| asset_refs | `Assets/NEON/VeewoUI/Uxml/Shell/Views/AresArsenalScreenNew.uxml` | 1 | none | 25721 |
| template_refs | `Assets/NEON/VeewoUI/Uxml/Mobile/Option_Controls_Mobile.uxml` | 2 | none | 749 |
| template_refs | `Assets/NEON/VeewoUI/Uxml/Tutorial/TutorialDifficultChoose.uxml` | 2 | none | 725 |
| template_refs | `Assets/NEON/VeewoUI/Uxml/Tutorial/TutGamePadMode.uxml` | 1 | none | 724 |
| template_refs | `Assets/NEON/VeewoUI/Uxml/OptionScreen/Option_KeyBoard.uxml` | 3 | none | 719 |
| template_refs | `Assets/NEON/VeewoUI/Uxml/UISlot/UISlot.uxml` | 4 | none | 724 |
| template_refs | `Assets/NEON/VeewoUI/Uxml/NewScreens/NoticeScreenNew.uxml` | 2 | none | 731 |
| template_refs | `Assets/NEON/VeewoUI/Uxml/OptionScreen/OptionScreenNew.uxml` | 11 | none | 728 |
| template_refs | `Assets/NEON/VeewoUI/Uxml/NewScreens/HeroChooseScreenNew.uxml` | 1 | none | 744 |
| selector_bindings | `Assets/NEON/VeewoUI/Uxml/BarScreen/Patch/PatchItemPreview.uxml` | 3 | none | 27729 |
| selector_bindings | `Assets/NEON/VeewoUI/Uxml/Shell/Views/EliteBossScreenNew.uxml` | 4 | none | 27463 |
| selector_bindings | `Assets/NEON/VeewoUI/Uxml/BarScreen/Boss/EliteBossScreen.uxml` | 8 | none | 26908 |
| selector_bindings | `Assets/NEON/VeewoUI/Uxml/Shell/Views/DressUpScreenNew.uxml` | 12 | none | 27655 |
| selector_bindings | `Assets/NEON/VeewoUI/Uxml/BarScreen/CoreScreen.uxml` | 13 | none | 31149 |
| selector_bindings | `Assets/NEON/VeewoUI/Uxml/BarScreen/Achievement/AchievementScreen.uxml` | 17 | none | 27348 |
