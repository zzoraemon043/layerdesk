# Contributor rules

These rules apply to every contributor, human or automated.

## Code

- Do not write code comments. Name things so the code explains itself.
- Do not use emoji in code, docs, commit messages, issues or pull requests.
- Keep functions small and files focused on one job.
- Every edit command, every check rule and every file format path needs tests.
- The app must never send user files to a server, and must not load anything from a CDN at runtime.
- Only add dependencies whose licenses allow redistribution in an MIT project, and list them in `THIRD_PARTY_NOTICES.md`.

## Assets and trademarks

- Test fixtures must be generated in code or be simple hand-made shapes. Do not commit real artwork, character models, PSD files downloaded from elsewhere, or any file or code from Live2D or Esoteric Software.
- Do not copy icons, logos or interface artwork from other image editors.
- Do not use other companies' product names in the app name, logo or icons. Product names may appear only in plain text to describe compatibility.

## Commits and pull requests

- Write short commit messages in Traditional Chinese with a type prefix and a half-width colon: `新增:`, `修正:`, `優化:`, `文件:` or `測試:`, for example `修正:剪裁遮色片位置錯誤`. Keep the subject on one line.
- Author and commit as the repository owner: `zzoraemon043 <195147269+zzoraemon043@users.noreply.github.com>`.
- Do not add co-author trailers, tool attribution lines, session links or "generated with" footers.
- Do not mention the tools used to write the code.
- Branch names use `feat/xxx` or `fix/xxx` and must not contain the name of any tool or AI product.
- Do not use the name of any AI product or company anywhere in the repository.

## Docs

- Keep `README.md` bilingual: Traditional Chinese (Taiwan) and English.
- Use Taiwan vocabulary in Chinese text.

## Checks before pushing

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- Open the built site with the network disabled and confirm it still opens a PSD, moves a layer and saves it.
