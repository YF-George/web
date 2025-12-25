<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { enterRoom } from '$lib/room';
	import { page } from '$app/stores';
	import { LiveObject, LiveList } from '@liveblocks/client';

	interface GroupMember {
		profession: string;
		isDriver: boolean;
		isHelper: boolean;
		playerId: string;
		gearScore: string | number;
	}

	interface LocalGroup {
		id: string;
		members: GroupMember[];
		departureTime?: string; // 格式: HH:mm (24 小時)
		departureDate?: string; // 格式: YYYY-MM-DD
		status?: string; // '招募中' | '已準備' | '已出團'
		dungeonName?: string; // 副本名稱
		level?: string; // 等級
		gearScoreReq?: string; // 裝分限制
		contentType?: string; // 內容類型：俠境/百業/百業+俠境
		changeLog?: ChangeLog[]; // 該團隊的變動紀錄
	}

	// Liveblocks 儲存層型別（符合 Lson 規範）
	type LiveGroupMember = {
		profession: string;
		isDriver: boolean;
		isHelper: boolean;
		playerId: string;
		gearScore: string | number;
	};

	type LiveChangeLog = {
		id: string;
		timestamp: string; // ISO 字串
		gameId: string;
		action: string;
		details: string;
	};

	type LiveGroup = {
		id: string;
		members: LiveList<LiveObject<LiveGroupMember>>;
		departureDate: string;
		departureTime: string;
		status?: string;
		dungeonName?: string;
		level?: string;
		gearScoreReq?: string;
		contentType?: string;
		changeLog: LiveList<LiveObject<LiveChangeLog>>;
	};

	type LiveRoot = {
		groups: LiveList<LiveObject<LiveGroup>>;
	};

	interface ChangeLog {
		id: string;
		timestamp: Date;
		gameId: string;
		action: string; // 「添加團隊」、「刪除團隊」、「更新成員」、「更新發車時間」等
		details: string; // 詳細描述
	}

	// ---- 常數與共用工具 ----
	const GROUP_SIZE = 10;
	const MAX_CHANGELOG_ENTRIES = 100; // 最多保留 100 筆記錄
	const PENDING_UPDATE_DELAY = 3000; // 等待 3 秒合併多次輸入，減少紀錄雜訊

	// 將欄位對應為中文標籤，供變更紀錄使用
	const FIELD_LABELS: Record<string, string> = {
		profession: '職能',
		isDriver: '隊長',
		isHelper: '幫打',
		playerId: '玩家 ID',
		gearScore: '裝分',
		departureDate: '發車日期',
		departureTime: '發車時間'
	};

	// 產生 10 人的預設成員列表（坦/奶/輸出各一，其他為輸出）
	function buildDefaultMembers(): GroupMember[] {
		return Array.from({ length: GROUP_SIZE }, (_, i) => ({
			profession: i === 0 ? '坦克' : i === 1 ? '治療' : '輸出',
			isDriver: false,
			isHelper: false,
			playerId: '',
			gearScore: ''
		}));
	}

	// 建立一個空團隊，並可選擇帶入初始變更紀錄
	function createEmptyGroup(id: string, changeLogEntry?: ChangeLog): LocalGroup {
		return {
			id,
			members: buildDefaultMembers(),
			status: '招募中',
			departureDate: '',
			departureTime: '',
			changeLog: changeLogEntry ? [changeLogEntry] : []
		};
	}

	interface PendingUpdate {
		groupId: string;
		index?: number;
		field: string;
		oldValue: string | boolean | number;
		newValue: string | boolean | number;
		timeout?: ReturnType<typeof setTimeout>;
	}

	// ---- 連線與狀態 ----
	// Liveblocks 連線物件與在線名單
	let others: Array<unknown> = [];
	let leave: (() => void) | null = null;
	let roomName = 'my-room';
	let room: ReturnType<typeof enterRoom>['room'] | null = null;

	let status = '';
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	let pendingUpdates = new Map<string, PendingUpdate>(); // 合併頻繁編輯再寫入紀錄
	let gameId = '';
	let uid = '';
	let isLoggedIn = false;
	let isAdmin = false;
	let isLoading = false;

	// 本頁的分頁狀態（填寫/紀錄）
	let activeTab: 'forms' | 'history' = 'forms';

	const initialGroup = createEmptyGroup('1');
	let groups: LocalGroup[] = [initialGroup]; // 本地表單資料，鏡像 Liveblocks 儲存層
	let activeGroupId = initialGroup.id; // 當前操作中的團隊 ID

	// Liveblocks 儲存層初始化與同步
	let storageInitialized = false;
	let storageRoot: LiveObject<LiveRoot> | null = null;

	function toLiveGroup(g: LocalGroup): LiveObject<LiveGroup> {
		return new LiveObject<LiveGroup>({
			id: g.id,
			members: new LiveList<LiveObject<LiveGroupMember>>(
				(g.members || []).map(
					(m) =>
						new LiveObject<LiveGroupMember>({
							profession: m.profession,
							isDriver: !!m.isDriver,
							isHelper: !!m.isHelper,
							playerId: m.playerId || '',
							gearScore: m.gearScore || ''
						})
				)
			),
			departureDate: g.departureDate || '',
			departureTime: g.departureTime || '',
			status: g.status || '招募中',
			dungeonName: g.dungeonName || '',
			level: g.level || '',
			gearScoreReq: g.gearScoreReq || '',
			contentType: g.contentType || '',
			changeLog: new LiveList<LiveObject<LiveChangeLog>>(
				(g.changeLog || []).map(
					(c) =>
						new LiveObject<LiveChangeLog>({
							id: c.id,
							timestamp: new Date(c.timestamp).toISOString(),
							gameId: c.gameId,
							action: c.action,
							details: c.details
						})
				)
			)
		});
	}

	// Push local state into Liveblocks storage once initialized
	// 儲存初始化後，將本地資料寫回 Liveblocks
	function syncLocalGroupsToStorage() {
		if (!storageInitialized || !storageRoot) return;
		try {
			const liveGroups = new LiveList<LiveObject<LiveGroup>>(groups.map((g) => toLiveGroup(g)));
			storageRoot!.set('groups', liveGroups);
		} catch (e) {
			console.error('syncLocalGroupsToStorage error', e);
		}
	}

	// 加入房間、串接 presence 與 storage 訂閱，並在卸載時清理
	onMount(async () => {
		// 依路由參數設定房間名稱
		const unsubPage = page.subscribe((p) => {
			roomName = (p.params?.id as string) || 'my-room';
		});

		const connection = enterRoom(roomName);
		room = connection.room;
		leave = connection.leave;

		// others 訂閱
		const unsubscribeOthers = room.subscribe('others', (updatedOthers) => {
			others = updatedOthers as Array<unknown>;
		});

		try {
			// 儲存根節點包含共享的團隊清單
			const { root } = await room.getStorage();
			storageRoot = root as unknown as LiveObject<LiveRoot>;
			storageInitialized = true;

			// 若尚未存在 groups，初始化一次
			try {
				const existing = storageRoot.get('groups');
				if (!existing) {
					storageRoot.set(
						'groups',
						new LiveList<LiveObject<LiveGroup>>(groups.map((g) => toLiveGroup(g)))
					);
				}
			} catch (e) {
				console.error('storage groups init error', e);
			}

			// Liveblocks Storage -> 本地 state，保持雙向同步
			// Liveblocks 儲存層變動同步回本地狀態，保持雙向一致
			const unsubscribeStorage = room.subscribe(storageRoot!, () => {
				try {
					const immutable = (storageRoot as LiveObject<LiveRoot>).toImmutable();
					const groupsPlain = immutable.groups;
					if (groupsPlain) {
						groups = groupsPlain.map((lg) => ({
							id: String(lg.id ?? ''),
							members: (lg.members ?? []).map((m) => ({
								profession: String(m.profession ?? ''),
								isDriver: !!m.isDriver,
								isHelper: !!m.isHelper,
								playerId: String(m.playerId ?? ''),
								gearScore: (m.gearScore as string | number | undefined) ?? ''
							})),
							status: String(lg.status ?? '招募中'),
							departureDate: String(lg.departureDate ?? ''),
							departureTime: String(lg.departureTime ?? ''),
							dungeonName: String(lg.dungeonName ?? ''),
							level: String(lg.level ?? ''),
							gearScoreReq: String(lg.gearScoreReq ?? ''),
							contentType: String(lg.contentType ?? ''),
							changeLog: (lg.changeLog ?? []).map((c) => ({
								id: String(c.id ?? ''),
								timestamp: c.timestamp ? new Date(String(c.timestamp)) : new Date(),
								gameId: String(c.gameId ?? ''),
								action: String(c.action ?? ''),
								details: String(c.details ?? '')
							}))
						}));
						if (!groups.find((g) => g.id === activeGroupId)) {
							activeGroupId = groups[0]?.id || '1';
						}
					}
				} catch (e) {
					console.error('storage subscribe error', e);
				}
			});

			onDestroy(() => {
				unsubscribeOthers();
				unsubscribeStorage();
				unsubPage();
				if (leave) leave();
			});
		} catch (e) {
			console.error('init storage error', e);
		}
	});

	// 將緩衝中的編輯寫入 changelog，避免每次輸入都產生紀錄
	function commitPendingUpdate(key: string) {
		const pending = pendingUpdates.get(key);
		if (!pending) return;

		const group = groups.find((g) => g.id === pending.groupId);
		if (!group) return;

		if (!group.changeLog) {
			group.changeLog = [];
		}

		const fieldLabel = FIELD_LABELS[pending.field] || pending.field;

		let action = '更新成員';
		let details = '';

		if (pending.index !== undefined) {
			// 成員詳細記錄
			// 新格式：顯示舊值與新值
			details = `成員 ${pending.index + 1} 的「${fieldLabel}」(${String(
				pending.oldValue
			)}) 更新為 (${String(pending.newValue)})`;
		} else {
			// 團隊級欄位
			if (pending.field === 'departureDate') {
				action = '更新發車日期';
			} else if (pending.field === 'departureTime') {
				action = '更新發車時間';
			}
			// 新格式：顯示舊值與新值
			details = `「${fieldLabel}」(${String(pending.oldValue)}) 更新為 (${String(
				pending.newValue
			)})`;
		}

		group.changeLog = [
			{
				id: crypto.randomUUID(),
				timestamp: new Date(),
				gameId,
				action,
				details
			},
			...(group.changeLog || [])
		].slice(0, MAX_CHANGELOG_ENTRIES);

		groups = groups; // 觸發 Svelte 反應式更新
		pendingUpdates.delete(key);
	}

	// 驗證遊戲 ID / 密碼，成功後切換登入狀態
	async function handleLogin() {
		if (!browser) return; // SSR 不呼叫 fetch，僅在瀏覽器執行
		if (!gameId.trim()) {
			status = '❌ 請輸入遊戲 ID';
			setTimeout(() => (status = ''), 2000);
			return;
		}

		isLoading = true;

		try {
			const response = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ gameId: gameId.trim(), uid: uid.trim() })
			});

			const result = await response.json();

			if (result.success) {
				isLoggedIn = true;
				isAdmin = !!result.isAdmin;
			} else {
				status = `❌ ${result.error || '登入失敗'}`;
				setTimeout(() => (status = ''), 3000);
			}
		} catch (e) {
			console.error(e);
			status = '❌ 登入失敗，請檢查網路連線';
			setTimeout(() => (status = ''), 3000);
		} finally {
			isLoading = false;
		}
	}

	// 重置登入狀態，並將未寫入的 pending 更新刷入 changelog
	function logout() {
		isLoggedIn = false;
		isAdmin = false;

		// 提交所有未提交的更新
		pendingUpdates.forEach((pending, key) => {
			clearTimeout(pending.timeout);
			commitPendingUpdate(key);
		});

		gameId = '';
		uid = '';
		groups = [createEmptyGroup('1')];
		activeGroupId = groups[0].id;
		pendingUpdates.clear();
	}

	// 管理員新增團隊，並寫入「建立團隊」紀錄
	function addNewGroup() {
		if (!isAdmin) {
			status = '❌ 只有管理員可以添加團隊';
			setTimeout(() => (status = ''), 3000);
			return;
		}

		// 團隊數量上限
		const MAX_GROUPS = 12;
		if (groups.length >= MAX_GROUPS) {
			status = `❌ 已達團隊上限 (${MAX_GROUPS})`;
			setTimeout(() => (status = ''), 3000);
			return;
		}
		// 找出最大的 ID 號碼，然後 +1
		const maxId = groups.reduce((max, g) => Math.max(max, parseInt(g.id) || 0), 0);
		const newId = (maxId + 1).toString();
		const creationLog: ChangeLog = {
			id: crypto.randomUUID(),
			timestamp: new Date(),
			gameId,
			action: '建立團隊',
			details: '團隊建立'
		};
		const newGroup = createEmptyGroup(newId, creationLog);
		groups = [...groups, newGroup];
		activeGroupId = newGroup.id;
		renumberGroups();

		// 同步到儲存層
		syncLocalGroupsToStorage();
	}

	// 管理員刪除團隊，會先記錄刪除事件
	function deleteGroup(groupId: string) {
		if (!isAdmin) {
			status = '❌ 只有管理員可以刪除團隊';
			setTimeout(() => (status = ''), 3000);
			return;
		}
		if (groups.length <= 1) {
			status = '❌ 至少需保留一個團隊';
			setTimeout(() => (status = ''), 2000);
			return;
		}
		const groupToDelete = groups.find((g) => g.id === groupId);
		if (groupToDelete && groupToDelete.changeLog) {
			groupToDelete.changeLog = [
				{
					id: crypto.randomUUID(),
					timestamp: new Date(),
					gameId,
					action: '刪除團隊',
					details: `團隊已刪除`
				},
				...(groupToDelete.changeLog || [])
			];
		}
		groups = groups.filter((g) => g.id !== groupId);
		if (activeGroupId === groupId) activeGroupId = groups[0]?.id || '1';
		renumberGroups();

		// 同步到儲存層
		syncLocalGroupsToStorage();
	}

	// 重新編號所有團隊，從 1 開始並保留活躍索引
	function renumberGroups() {
		const currentActiveIndex = groups.findIndex((g) => g.id === activeGroupId);
		groups = groups.map((group, index) => ({
			...group,
			id: (index + 1).toString()
		}));
		// 保持當前活躍的團隊位置
		if (currentActiveIndex >= 0 && currentActiveIndex < groups.length) {
			activeGroupId = groups[currentActiveIndex].id;
		} else {
			activeGroupId = groups[0]?.id || '1';
		}

		// 同步到儲存層（確保 ID 連號變更被覆蓋）
		syncLocalGroupsToStorage();
	}

	// 成員/團隊欄位共用的更新入口，會啟用延遲寫入的 pending 更新
	function updateGroupField(
		groupId: string,
		index: number | undefined,
		field: keyof GroupMember | keyof LocalGroup,
		value: string | boolean
	) {
		// 如果 index 為 undefined，更新團隊層級的欄位
		if (index === undefined) {
			const group = groups.find((g) => g.id === groupId);
			if (!group) return;

			const oldValue = group[field as keyof LocalGroup];
			groups = groups.map((g) => (g.id === groupId ? { ...g, [field]: value } : g));

			// 只有當舊值是字串或 undefined 時才記錄變更
			if (typeof oldValue === 'string' || oldValue === undefined) {
				if (oldValue !== value) {
					const key = `${groupId}-${field}`;

					// 清除舊的計時器
					if (pendingUpdates.has(key)) {
						clearTimeout(pendingUpdates.get(key)!.timeout);
					}

					// 記錄未提交的變動
					const pending: PendingUpdate = {
						groupId,
						field: field as string,
						oldValue: oldValue || '',
						newValue: value,
						timeout: setTimeout(() => commitPendingUpdate(key), PENDING_UPDATE_DELAY)
					};

					pendingUpdates.set(key, pending);
				}
			}

			syncLocalGroupsToStorage();
			return;
		}

		// 原本的成員欄位更新邏輯
		const oldMember = groups.find((g) => g.id === groupId)?.members[index];
		groups = groups.map((g) =>
			g.id === groupId
				? { ...g, members: g.members.map((m, i) => (i === index ? { ...m, [field]: value } : m)) }
				: g
		);

		if (oldMember) {
			const key = `${groupId}-${index}-${field}`;

			// 清除舊的計時器
			if (pendingUpdates.has(key)) {
				clearTimeout(pendingUpdates.get(key)!.timeout);
			}

			// 記錄未声紱的變動
			const pending: PendingUpdate = {
				groupId,
				index,
				field: field as string,
				oldValue: oldMember[field as keyof GroupMember],
				newValue: value,
				timeout: setTimeout(() => commitPendingUpdate(key), PENDING_UPDATE_DELAY)
			};

			pendingUpdates.set(key, pending);
		}

		// 同步到儲存層（成員層級欄位變更）
		syncLocalGroupsToStorage();
	}

	function getActiveGroup() {
		return groups.find((g) => g.id === activeGroupId) || groups[0];
	}

	function updateGroupDate(groupId: string, value: string) {
		const oldDate = groups.find((g) => g.id === groupId)?.departureDate;
		groups = groups.map((g) => (g.id === groupId ? { ...g, departureDate: value } : g));
		if (oldDate !== value) {
			const key = `date-${groupId}`;

			// 清除舊的計時器
			if (pendingUpdates.has(key)) {
				clearTimeout(pendingUpdates.get(key)!.timeout);
			}

			const pending: PendingUpdate = {
				groupId,
				field: 'departureDate',
				oldValue: oldDate || '',
				newValue: value,
				timeout: setTimeout(() => commitPendingUpdate(key), PENDING_UPDATE_DELAY)
			};

			pendingUpdates.set(key, pending);
		}

		// 同步到儲存層（發車日期變更）
		syncLocalGroupsToStorage();
	}

	function updateGroupTime(groupId: string, value: string) {
		const oldTime = groups.find((g) => g.id === groupId)?.departureTime;
		groups = groups.map((g) => (g.id === groupId ? { ...g, departureTime: value } : g));
		if (oldTime !== value) {
			const key = `time-${groupId}`;

			// 清除舊的計時器
			if (pendingUpdates.has(key)) {
				clearTimeout(pendingUpdates.get(key)!.timeout);
			}

			const pending: PendingUpdate = {
				groupId,
				field: 'departureTime',
				oldValue: oldTime || '',
				newValue: value,
				timeout: setTimeout(() => commitPendingUpdate(key), PENDING_UPDATE_DELAY)
			};

			pendingUpdates.set(key, pending);
		}

		// 同步到儲存層（發車時間變更）
		syncLocalGroupsToStorage();
	}

	function updateGroupStatus(groupId: string, value: string) {
		const oldStatus = groups.find((g) => g.id === groupId)?.status;
		groups = groups.map((g) => (g.id === groupId ? { ...g, status: value } : g));
		if (oldStatus !== value) {
			const key = `status-${groupId}`;
			if (pendingUpdates.has(key)) {
				clearTimeout(pendingUpdates.get(key)!.timeout);
			}
			const pending: PendingUpdate = {
				groupId,
				field: 'status',
				oldValue: oldStatus || '',
				newValue: value,
				timeout: setTimeout(() => commitPendingUpdate(key), PENDING_UPDATE_DELAY)
			};
			pendingUpdates.set(key, pending);
		}

		// 同步到儲存層（狀態變更）
		syncLocalGroupsToStorage();
	}

	// 使用 Zeller 演算法由 YYYY-MM-DD 推算星期
	function getGroupWeekday(g: LocalGroup) {
		const d = (g.departureDate || '').trim();
		if (!d) return '';

		// 支援 YYYY-MM-DD 格式
		const match = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
		if (!match) return '';

		const year = Number(match[1]);
		const month = Number(match[2]);
		const day = Number(match[3]);

		if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return '';
		if (month < 1 || month > 12) return '';
		const daysInMonth = [
			31,
			year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
			31,
			30,
			31,
			30,
			31,
			31,
			30,
			31,
			30,
			31
		];
		if (day < 1 || day > daysInMonth[month - 1]) return '';
		let Y = year;
		let mZ = month;
		let q = day;
		if (mZ <= 2) {
			mZ += 12;
			Y -= 1;
		}
		const K = Y % 100;
		const J = Math.floor(Y / 100);
		const h =
			(q + Math.floor((13 * (mZ + 1)) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) + 5 * J) % 7;
		const dayIndex = (h + 6) % 7;
		const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
		return weekdays[dayIndex];
	}

	// 回傳星期索引（0 = 星期日, 6 = 星期六），找不到則回 -1
	function getGroupWeekdayIndex(g: LocalGroup) {
		const d = (g.departureDate || '').trim();
		if (!d) return -1;

		const match = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
		if (!match) return -1;

		const year = Number(match[1]);
		const month = Number(match[2]);
		const day = Number(match[3]);

		if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return -1;
		if (month < 1 || month > 12) return -1;
		const daysInMonth = [
			31,
			year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
			31,
			30,
			31,
			30,
			31,
			31,
			30,
			31,
			30,
			31
		];
		if (day < 1 || day > daysInMonth[month - 1]) return -1;

		let Y = year;
		let mZ = month;
		let q = day;
		if (mZ <= 2) {
			mZ += 12;
			Y -= 1;
		}
		const K = Y % 100;
		const J = Math.floor(Y / 100);
		const h =
			(q + Math.floor((13 * (mZ + 1)) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) + 5 * J) % 7;
		const dayIndex = (h + 6) % 7; // 0 = Sunday
		return dayIndex;
	}
</script>

<svelte:head>
	<title>批次團隊填寫（10 人）</title>
</svelte:head>

{#if !isLoggedIn}
	<div class="login-container">
		<div class="login-card">
			<div class="login-header">
				<h1>團隊管理系統</h1>
			</div>

			{#if status && !isLoggedIn}
				<div class="login-status error">{status}</div>
			{/if}

			<form
				class="login-form"
				onsubmit={(e) => {
					e.preventDefault();
					handleLogin();
				}}
			>
				<label class="login-label">
					<span class="login-label-text">遊戲 ID <span class="required">*</span></span>
					<input
						type="text"
						class="login-input"
						placeholder="請輸入您的遊戲 ID"
						value={gameId}
						oninput={(e) => (gameId = (e.target as HTMLInputElement).value)}
					/>
				</label>

				<label class="login-label">
					<span class="login-label-text">密碼</span>
					<input
						type="password"
						class="login-input"
						placeholder="選填，輸入後以管理員模式登入"
						value={uid}
						oninput={(e) => (uid = (e.target as HTMLInputElement).value)}
					/>
				</label>

				<button type="submit" class="login-button" disabled={isLoading}>
					{#if isLoading}
						⏳ 驗證中...
					{:else}
						進入系統
					{/if}
				</button>
			</form>

			<!-- login footer removed per request -->
		</div>
	</div>
{:else}
	<div class="container">
		<header>
			<div class="online-status" aria-live="polite" title="其他線上使用者數量">
				其他線上人數: {others.length}
			</div>
			<nav class="main-nav" aria-label="主要導覽">
				<ul class="nav-list">
					<li class="nav-item">
						<button
							class="nav-link"
							class:active={activeTab === 'forms'}
							onclick={() => (activeTab = 'forms')}
						>
							填寫表單
						</button>
					</li>
					<li class="nav-item">
						<button
							class="nav-link"
							class:active={activeTab === 'history'}
							onclick={() => (activeTab = 'history')}
						>
							更改紀錄
						</button>
					</li>
				</ul>
				<div class="nav-actions">
					<span class="nav-user">千羽夜</span>
					<span class="nav-role">{isAdmin ? '管理員' : '一般玩家'}</span>
					<button class="nav-logout" onclick={logout}>登出</button>
				</div>
			</nav>
			<!-- 頂部區塊：使用者資訊已移至導覽列 -->
		</header>

		{#if status}
			<div class="toolbar">
				<div
					class="status"
					class:error={status.includes('❌')}
					class:success={status.includes('✅')}
				>
					{status}
				</div>
			</div>
		{/if}

		<section class="group-section">
			<div class="tabs-wrapper">
				<div class="tabs-header">
					<div class="tabs">
						{#each groups as group (group.id)}
							<button
								class="tab"
								class:active={activeGroupId === group.id}
								class:recruit={group.status === '招募中'}
								class:ready={group.status === '已準備'}
								class:done={group.status === '已出團'}
								onclick={() => (activeGroupId = group.id)}
							>
								團隊 {group.id}
								{#if activeTab === 'forms' && groups.length > 1 && isAdmin}
									<span
										class="tab-close"
										onclick={(e) => {
											e.stopPropagation();
											deleteGroup(group.id);
										}}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												e.stopPropagation();
												deleteGroup(group.id);
											}
										}}
										role="button"
										tabindex="0"
										title="刪除此團隊"
									>
										×
									</span>
								{/if}
							</button>
						{/each}
						{#if activeTab === 'forms' && isAdmin && groups.length < 12}
							<button class="tab-add" onclick={addNewGroup} title="添加新團隊">+ 添加團隊</button>
						{/if}
					</div>
				</div>
				{#if activeTab === 'forms'}
					{#if getActiveGroup()}
						<div class="departure-time-row">
							<label class="departure-label">
								<input
									class="departure-input departure-date"
									type="date"
									aria-label="發車日期"
									value={getActiveGroup().departureDate ?? ''}
									onchange={(e) =>
										updateGroupDate(activeGroupId, (e.target as HTMLInputElement).value)}
								/>
							</label>
							<label class="departure-label">
								<input
									class="departure-input departure-time"
									type="time"
									aria-label="發車時間"
									value={getActiveGroup().departureTime ?? ''}
									onchange={(e) =>
										updateGroupTime(activeGroupId, (e.target as HTMLInputElement).value)}
								/>
							</label>
							<div class="departure-weekday">
								{#if getGroupWeekday(getActiveGroup())}
									<span
										class="weekday"
										class:weekend={getGroupWeekdayIndex(getActiveGroup()) === 0 ||
											getGroupWeekdayIndex(getActiveGroup()) === 6}
										class:sun={getGroupWeekdayIndex(getActiveGroup()) === 0}
										class:sat={getGroupWeekdayIndex(getActiveGroup()) === 6}
									>
										{getGroupWeekday(getActiveGroup())}
									</span>
								{/if}
							</div>
							<label class="departure-label">
								<input
									class="departure-input dungeon-name"
									type="text"
									aria-label="副本名稱"
									placeholder="副本名稱"
									value={getActiveGroup().dungeonName ?? ''}
									oninput={(e) =>
										updateGroupField(
											activeGroupId,
											undefined,
											'dungeonName',
											(e.target as HTMLInputElement).value
										)}
								/>
							</label>
							<label class="departure-label">
								<input
									class="departure-input level"
									type="text"
									aria-label="等級"
									placeholder="等級"
									value={getActiveGroup().level ?? ''}
									oninput={(e) =>
										updateGroupField(
											activeGroupId,
											undefined,
											'level',
											(e.target as HTMLInputElement).value
										)}
								/>
							</label>
							<label class="departure-label">
								<input
									class="departure-input gear-score-req"
									type="text"
									aria-label="裝分限制"
									placeholder="裝分限制"
									value={getActiveGroup().gearScoreReq ?? ''}
									oninput={(e) =>
										updateGroupField(
											activeGroupId,
											undefined,
											'gearScoreReq',
											(e.target as HTMLInputElement).value
										)}
								/>
							</label>
							<label class="departure-label">
								<select
									class="departure-input content-type"
									aria-label="內容類型"
									value={getActiveGroup().contentType ?? ''}
									onchange={(e) =>
										updateGroupField(
											activeGroupId,
											undefined,
											'contentType',
											(e.target as HTMLSelectElement).value
										)}
								>
									<option value="">請選擇</option>
									<option value="俠境">俠境</option>
									<option value="百業">百業</option>
									<option value="百業+俠境">百業+俠境</option>
								</select>
							</label>
							<label class="departure-label status-label" style="margin-left: auto;">
								<select
									class="departure-input status-select"
									class:recruit={getActiveGroup().status === '招募中'}
									class:ready={getActiveGroup().status === '已準備'}
									class:done={getActiveGroup().status === '已出團'}
									aria-label="團隊狀態"
									value={getActiveGroup().status ?? '招募中'}
									onchange={(e) =>
										updateGroupStatus(activeGroupId, (e.target as HTMLSelectElement).value)}
								>
									<option value="招募中">招募中</option>
									<option value="已準備">已準備</option>
									<option value="已出團">已出團</option>
								</select>
							</label>
						</div>
						<div class="group-grid">
							{#each getActiveGroup().members as member, index (index)}
								<div class="member-card">
									<div class="member-header">
										<span class="member-number">{index + 1}</span>
										<div class="role-badges">
											<label class="badge-checkbox" class:active={member.isDriver}>
												<input
													type="checkbox"
													checked={member.isDriver}
													onchange={(e) =>
														updateGroupField(
															activeGroupId,
															index,
															'isDriver',
															(e.target as HTMLInputElement).checked
														)}
												/>
												<span>🚩 隊長</span>
											</label>
											<label class="badge-checkbox" class:active={member.isHelper}>
												<input
													type="checkbox"
													checked={member.isHelper}
													onchange={(e) =>
														updateGroupField(
															activeGroupId,
															index,
															'isHelper',
															(e.target as HTMLInputElement).checked
														)}
												/>
												<span>🤝 幫打</span>
											</label>
										</div>
									</div>
									<div class="form-row">
										<div class="form-group">
											<label>
												<span class="label-text">職能</span>
												<select
													value={member.profession}
													onchange={(e) =>
														updateGroupField(
															activeGroupId,
															index,
															'profession',
															(e.target as HTMLSelectElement).value
														)}
												>
													<option value="">請選擇</option>
													<option value="坦克">坦克</option>
													<option value="治療">治療</option>
													<option value="輸出">輸出</option>
												</select>
											</label>
										</div>
									</div>
									<div class="form-row">
										<!-- 武器欄位已移除 -->
									</div>
									<div class="form-row">
										<div class="form-group">
											<label>
												<span class="label-text">玩家 ID</span>
												<input
													type="text"
													placeholder="遊戲 ID"
													value={member.playerId}
													oninput={(e) =>
														updateGroupField(
															activeGroupId,
															index,
															'playerId',
															(e.target as HTMLInputElement).value
														)}
												/>
											</label>
										</div>
									</div>
									<div class="form-row">
										<div class="form-group">
											<label>
												<span class="label-text">裝分</span>
												<input
													type="number"
													min="0"
													placeholder="0"
													value={member.gearScore}
													oninput={(e) =>
														updateGroupField(
															activeGroupId,
															index,
															'gearScore',
															(e.target as HTMLInputElement).value
														)}
												/>
											</label>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else}
					<section class="history-section">
						<div class="history-header-wrapper">
							<h2>📋 更改紀錄 - 團隊 {activeGroupId}</h2>
							<div class="history-stats">
								{#if (getActiveGroup()?.changeLog ?? []).length > 0}
									<span class="stat-item"
										>變更數：<strong>{(getActiveGroup()?.changeLog ?? []).length}</strong></span
									>
									<span class="stat-item"
										>最後更新：<strong
											>{(getActiveGroup()?.changeLog?.[0]?.timestamp ?? new Date()).toLocaleString(
												'zh-TW'
											)}</strong
										></span
									>
									{#if (getActiveGroup()?.changeLog ?? []).length >= MAX_CHANGELOG_ENTRIES}
										<span class="stat-item warning">⚠️ 已達上限 ({MAX_CHANGELOG_ENTRIES} 筆)</span>
									{/if}
								{:else}
									<span class="stat-item">變更數：<strong>0</strong></span>
								{/if}
							</div>
						</div>

						{#if (getActiveGroup()?.changeLog ?? []).length === 0}
							<div class="history-empty">
								<p class="history-note">✨ 此團隊尚無更改紀錄</p>
								<p class="history-hint">在「填寫表單」頁面對此團隊進行操作都會記錄在此</p>
							</div>
						{:else}
							<div class="history-list">
								{#each getActiveGroup()?.changeLog ?? [] as entry (entry.id)}
									<div class="history-entry">
										<div class="history-action-badge">
											{#if entry.action === '建立團隊'}
												<span class="badge badge-create">🆕 {entry.action}</span>
											{:else if entry.action === '刪除團隊'}
												<span class="badge badge-delete">🗑️ {entry.action}</span>
											{:else if entry.action === '更新成員'}
												<span class="badge badge-update">✏️ {entry.action}</span>
											{:else if entry.action === '更新發車日期'}
												<span class="badge badge-date">{entry.action}</span>
											{:else if entry.action === '更新發車時間'}
												<span class="badge badge-time">⏰ {entry.action}</span>
											{:else}
												<span class="badge">{entry.action}</span>
											{/if}
										</div>
										<span class="history-details">{entry.details}</span>
										<span class="history-user">操作者：<strong>{entry.gameId}</strong></span>
										<time class="history-timestamp"
											>{entry.timestamp.toLocaleTimeString('zh-TW', { hour12: false })}
											{entry.timestamp.toLocaleDateString('zh-TW')}</time
										>
									</div>
								{/each}
							</div>
						{/if}
					</section>
				{/if}
			</div>
		</section>
	</div>
{/if}

<style>
	/* 固定右上角顯示其他線上人數，並在小螢幕下縮小樣式 */
	.online-status {
		position: fixed;
		top: 1rem;
		right: 1rem;
		background: rgba(0, 20, 40, 0.9);
		padding: 0.5rem 0.9rem;
		border: 1px solid #00ff9d;
		border-radius: 6px;
		color: #00ff9d;
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace;
		z-index: 1100;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.95rem;
	}

	/* 小螢幕調整：靠邊、減少 padding 與文字大小 */
	@media (max-width: 640px) {
		.online-status {
			top: 0.5rem;
			right: 0.5rem;
			padding: 0.3rem 0.6rem;
			font-size: 0.85rem;
		}
	}

	/* Tab 狀態色彩 */
	.tab.recruit {
		background-color: #2563eb; /* 招募中 - 藍 */
		color: #fff;
	}

	.tab.ready {
		background-color: #16a34a; /* 已準備 - 綠 */
		color: #fff;
	}

	.tab.done {
		background-color: #dc2626; /* 已出團 - 紅 */
		color: #fff;
	}

	/* 非啟用 tab 半透明，啟用時回復不透明 */
	.tab:not(.active) {
		opacity: 0.65;
	}

	.tab.active {
		opacity: 1;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
	}
</style>
