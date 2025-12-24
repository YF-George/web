import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// 管理員白名單（後端安全儲存）
// 生產環境應使用環境變數或資料庫
const ADMIN_WHITELIST: Record<string, string> = {
	千羽夜: '3025782247',
	花豆豆: 'jerry1012',
	樂奈: '3034520835'
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { gameId, uid } = await request.json();

		// 驗證必填欄位
		if (!gameId || typeof gameId !== 'string') {
			return json(
				{
					success: false,
					error: '請輸入遊戲暱稱'
				},
				{ status: 400 }
			);
		}

		// 如果有輸入 UID，驗證管理員身份
		if (uid && typeof uid === 'string') {
			const isValidAdmin = ADMIN_WHITELIST[gameId] === uid;

			if (isValidAdmin) {
				return json({
					success: true,
					isAdmin: true,
					gameId
				});
			} else {
				return json(
					{
						success: false,
						error: '管理員驗證失敗：帳號或密碼錯誤'
					},
					{ status: 401 }
				);
			}
		}

		// 無 UID，一般玩家登入
		return json({
			success: true,
			isAdmin: false,
			gameId
		});
	} catch (error) {
		console.error(error);
		return json(
			{
				success: false,
				error: '登入失敗，請稍後再試'
			},
			{ status: 500 }
		);
	}
};
