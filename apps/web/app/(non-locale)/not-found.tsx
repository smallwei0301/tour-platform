// (non-locale) 群組專屬 not-found（issue-midao2 發現：Next.js 多重 root layout 規則要求
// 每個頂層 route group 各自要有 not-found.tsx，否則群組內 notFound() 只會 soft-404
// （渲染內容正確但 HTTP 狀態碼仍是 200，甚至在 dev 模式下對其他群組觸發
// 「not-found.tsx doesn't have a root layout」錯誤導致 500）。
// 直接沿用頂層 app/not-found.tsx 的內容與 metadata，不重複維護文案。
export { default, metadata } from '../not-found';
