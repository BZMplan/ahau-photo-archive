export function POST() {
  return Response.json(
    {
      error: {
        code: "NOT_IMPLEMENTED",
        message: "投稿将在下一阶段开放，目前不会接收或保存文件。",
      },
    },
    { status: 501 },
  );
}
