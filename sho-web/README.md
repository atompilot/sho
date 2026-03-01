# sho-web

Sho 的 Next.js 前端。/ Next.js frontend for Sho.

## Setup / 安装

```bash
npm install
```

## Development / 开发

```bash
npm run dev
```

Opens at http://localhost:3000. Requires the API server running at `NEXT_PUBLIC_API_URL` (default: `http://localhost:15080`).

需要 API 服务运行在 `NEXT_PUBLIC_API_URL`（默认 `http://localhost:15080`）。

## Build / 构建

```bash
npm run build
npm start
```

## Environment / 环境变量

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:15080` | API URL for server-side requests (SSR) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:15080` | API URL for client-side requests |

## Structure / 结构

```
sho-web/
├── app/
│   ├── page.tsx            Home page / 首页
│   ├── [slug]/page.tsx     Post viewer / 内容展示页
│   ├── edit/               Edit page / 编辑页
│   ├── explore/page.tsx    Explore posts / 浏览页
│   └── layout.tsx          Root layout
├── components/
│   ├── ContentRenderer.tsx  Format-aware renderer / 格式渲染器
│   └── HomeClient.tsx       Home page client component
├── lib/
│   └── detectFormat.ts      Client-side format detection
└── public/
    ├── skill.md             AI agent documentation / AI agent 文档
    └── logo.png
```

See the [root README](../README.md) for full project documentation.
