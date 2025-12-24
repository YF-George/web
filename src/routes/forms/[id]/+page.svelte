<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { SvelteMap } from 'svelte/reactivity';
	import { getChannel } from '$lib/realtime';
	import { enterRoom, leaveRoom } from '$lib/liveblocks';

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
		dungeonName?: string; // 副本名稱
		level?: string; // 等級
		gearScoreReq?: string; // 裝分限制
		contentType?: string; // 內容類型：俠境/百業/百業+俠境
		changeLog?: ChangeLog[]; // 該團隊的變動紀錄
	}

	interface ChangeLog {
		id: string;
		timestamp: Date;
		gameId: string;
		action: string; // 「添加團隊」、「刪除團隊」、「更新成員」、「更新發車時間」等
		details: string; // 詳細描述
	}

	const GROUP_SIZE = 10;
	const MAX_CHANGELOG_ENTRIES = 100; // 最多保留 100 筆記錄

	interface PendingUpdate {
		groupId: string;
		index?: number;
		field: string;
		oldValue: string | boolean | number;
		newValue: string | boolean | number;
		timeout?: ReturnType<typeof setTimeout>;
	}

	let status = '';
	let pendingUpdates = new SvelteMap<string, PendingUpdate>(); // 追蹤未提交的詳細変拍
	let gameId = '';
	let uid = '';
	let isLoggedIn = false;
	let isAdmin = false;
	let isLoading = false;
	let formId = '';
	$: formId = $page.params.id;
	let refreshInterval: ReturnType<typeof setInterval> | null = null;
	let isSyncing = false; // 防止同步衝突

	// 即時通道（Ably）：若未設定 PUBLIC_ABLY_KEY 則為 null
	let rtChannel: ReturnType<typeof getChannel> | null = null;
	// Liveblocks 房間（若設定 LIVEBLOCKS_SECRET_KEY 且 auth 通過）
	let lbRoom: ReturnType<typeof enterRoom> | null = null;

	// local tab state for this page: 'forms' | 'history'
	let activeTab: 'forms' | 'history' = 'forms';

	let groups: LocalGroup[] = [
		{
			id: '1',
			members: Array.from({ length: GROUP_SIZE }, (_, i) => ({
				profession: i === 0 ? '坦克' : i === 1 ? '治療' : '輸出',
				isDriver: false,
				isHelper: false,
				playerId: '',
				gearScore: ''
			})),
			departureDate: '',
			departureTime: '',
			changeLog: []
		}
	];

	let activeGroupId = '1';

	// 資料持久化：以表單路由 id 為 key（所有使用者共享）
	const getStorageKey = () => (formId ? `teams-${formId}` : null);

	// 自動刷新函數
	function startAutoRefresh() {
		// 若有即時通道，禁用輪詢（不啟動 100ms）
		if (rtChannel) return;
		if (refreshInterval) return;
		// 沒有即時通道時才回退輪詢（仍可改為更長間隔，或完全停用）
		// 需求：不要 100ms；此處改為不啟動任何輪詢。
		return;
	}

	function stopAutoRefresh() {
		if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = null;
		}
	}

	onDestroy(() => {
		stopAutoRefresh();
		// 取消訂閱即時通道
		rtChannel?.unsubscribe();
		rtChannel = null;
		// 離開 Liveblocks 房間
		leaveRoom();
		lbRoom = null;
	});

	function setupRealtime() {
		// 即時頻道名稱需與後端一致：teams:{formId}
		if (!formId) return false;
		const channelKey = `teams:${formId}`;
		const ch = getChannel(channelKey);
		if (!ch) return false;
		rtChannel = ch;
		ch.subscribe('groups', (msg) => {
			const serverGroups = (msg.data as LocalGroup[]).map((g) => ({
				...g,
				changeLog:
					g.changeLog?.map((log) => ({
						...log,
						timestamp: new Date(log.timestamp as unknown as string)
					})) || []
			}));
			const serverHash = JSON.stringify(serverGroups);
			const currentHash = JSON.stringify(groups);
			if (serverHash !== currentHash) {
				groups = serverGroups;
				saveGroupsToLocalStorage();
				// 即時資料已更新
			}
		});
		return true;
	}

	function setupLiveblocks() {
		if (!formId) return false;
		lbRoom = enterRoom(`teams:${formId}`);
		// 訂閱 Liveblocks 事件
		lbRoom.subscribe('event', ({ event }) => {
			// 事件格式：{ type: string, data: unknown }
			const ev = event as { type: string; data: unknown };
			if (!ev || ev.type !== 'groups' || !Array.isArray(ev.data)) return;
			const serverGroups = (ev.data as LocalGroup[]).map((g) => ({
				...g,
				changeLog:
					g.changeLog?.map((log) => ({
						...log,
						timestamp: new Date(log.timestamp as unknown as string)
					})) || []
			}));
			const serverHash = JSON.stringify(serverGroups);
			const currentHash = JSON.stringify(groups);
			if (serverHash !== currentHash) {
				groups = serverGroups;
				saveGroupsToLocalStorage();
			}
		});
		return true;
	}

	function publishRealtime(next: LocalGroup[]) {
		if (!rtChannel) return;
		const payload = next.map((g) => ({
			...g,
			changeLog:
				g.changeLog?.map((log) => ({
					...log,
					timestamp:
						log.timestamp instanceof Date
							? log.timestamp.toISOString()
							: (log.timestamp as unknown as string)
				})) || []
		}));
		rtChannel.publish('groups', payload);
	}

	function publishLiveblocks(next: LocalGroup[]) {
		if (!lbRoom) return;
		const payload = next.map((g) => ({
			...g,
			changeLog:
				g.changeLog?.map((log) => ({
					...log,
					timestamp:
						log.timestamp instanceof Date
							? log.timestamp.toISOString()
							: (log.timestamp as unknown as string)
				})) || []
		}));
		lbRoom.broadcastEvent({ type: 'groups', data: payload });
	}

	async function saveGroupsToServer() {
		if (!formId) return;
		try {
			await fetch('/api/groups', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					formId,
					groups: groups.map((g) => ({
						...g,
						changeLog:
							g.changeLog?.map((log) => ({
								...log,
								timestamp:
									log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp
							})) || []
					}))
				})
			});
			// 發布到即時通道（若可用）
			publishLiveblocks(groups);
			publishRealtime(groups);
		} catch (e) {
			console.warn('無法儲存資料到伺服器:', e);
		}
	}

	function saveGroupsToLocalStorage() {
		const key = getStorageKey();
		if (!key) return;
		try {
			localStorage.setItem(
				key,
				JSON.stringify(
					groups.map((g) => ({
						...g,
						changeLog:
							g.changeLog?.map((log) => ({
								...log,
								timestamp:
									log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp
							})) || []
					}))
				)
			);
			void saveGroupsToServer();
		} catch (e) {
			console.warn('無法儲存資料到 localStorage:', e);
		}
	}

	async function loadGroupsFromServer() {
		if (!formId || isSyncing) return false;
		isSyncing = true;
		try {
			const response = await fetch(`/api/groups?formId=${encodeURIComponent(formId)}`);
			if (!response.ok) throw new Error('server load failed');
			const data = await response.json();
			if (Array.isArray(data.groups) && data.groups.length > 0) {
				const serverGroups = data.groups.map((g: LocalGroup) => ({
					...g,
					changeLog:
						g.changeLog?.map((log: ChangeLog) => ({
							...log,
							timestamp: new Date(log.timestamp)
						})) || []
				}));

				// 檢查是否有變更（避免不必要的重新渲染）
				const serverHash = JSON.stringify(serverGroups);
				const currentHash = JSON.stringify(groups);

				if (serverHash !== currentHash) {
					groups = serverGroups;
					saveGroupsToLocalStorage();
					// 伺服器資料已更新
				}
				return true;
			}
		} catch (e) {
			console.warn('無法從伺服器載入資料:', e);
		} finally {
			isSyncing = false;
		}
		return false;
	}

	function loadGroupsFromLocalStorage() {
		const key = getStorageKey();
		if (!key) return;
		try {
			const saved = localStorage.getItem(key);
			if (saved) {
				groups = JSON.parse(saved).map((g: LocalGroup) => ({
					...g,
					changeLog:
						g.changeLog?.map((log: ChangeLog) => ({
							...log,
							timestamp: new Date(log.timestamp)
						})) || []
				}));
			}
		} catch (e) {
			console.warn('無法從 localStorage 載入資料:', e);
		}
	}

	function commitPendingUpdate(key: string) {
		const pending = pendingUpdates.get(key);
		if (!pending) return;

		const group = groups.find((g) => g.id === pending.groupId);
		if (!group) return;

		if (!group.changeLog) {
			group.changeLog = [];
		}

		const fieldLabel =
			{
				profession: '職能',
				isDriver: '隊長',
				isHelper: '幫打',
				playerId: '玩家 ID',
				gearScore: '裝分',
				departureDate: '發車日期',
				departureTime: '發車時間'
			}[pending.field] || pending.field;

		let action = '更新成員';
		let details = '';

		if (pending.index !== undefined) {
			// 成員詳細記錄
			details = `成員 ${pending.index + 1} 的「${fieldLabel}」更新為「${pending.newValue}」`;
		} else {
			// 團隊級欄位
			if (pending.field === 'departureDate') {
				action = '更新發車日期';
			} else if (pending.field === 'departureTime') {
				action = '更新發車時間';
			}
			details = `「${fieldLabel}」更新為「${pending.newValue}」`;
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

		groups = groups; // Trigger reactivity
		pendingUpdates.delete(key);
		saveGroupsToLocalStorage(); // 儲存資料
	}

	async function handleLogin() {
		if (!gameId.trim()) {
			status = '❌ 請輸入遊戲暱稱';
			setTimeout(() => (status = ''), 2000);
			return;
		}

		isLoading = true;

		try {
			const trimmedGameId = gameId.trim();
			const trimmedUid = uid.trim();
			const response = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ gameId: trimmedGameId, uid: trimmedUid })
			});

			const result = await response.json();

			if (result.success) {
				isLoggedIn = true;
				isAdmin = !!result.isAdmin;
				gameId = trimmedGameId; // 正規化帳號，避免前後空白造成 key 不一致
				uid = trimmedUid;
				// 登入後優先載入共享資料，失敗則回退本地
				const loadedFromServer = await loadGroupsFromServer();
				if (!loadedFromServer) {
					loadGroupsFromLocalStorage();
				}
				// 先嘗試 Liveblocks，其次 Ably，再次回退輪詢
				const lbOk = setupLiveblocks();
				if (!lbOk) {
					const rtOk = setupRealtime();
					if (!rtOk) {
						startAutoRefresh();
					}
				}
				status = '✅ 登入成功';
				setTimeout(() => (status = ''), 2000);
			} else {
				status = `❌ ${result.error || '登入失敗'}`;
				setTimeout(() => (status = ''), 2000);
			}
		} catch (e) {
			console.error(e);
			status = '❌ 登入失敗，請檢查網路連線';
			setTimeout(() => (status = ''), 2000);
		} finally {
			isLoading = false;
		}
	}

	function logout() {
		stopAutoRefresh();
		isLoggedIn = false;
		isAdmin = false;

		// 提交所有未提交的更新
		pendingUpdates.forEach((pending, key) => {
			clearTimeout(pending.timeout);
			commitPendingUpdate(key);
		});

		gameId = '';
		uid = '';
		groups = [
			{
				id: '1',
				members: Array.from({ length: GROUP_SIZE }, (_, i) => ({
					profession: i === 0 ? '坦克' : i === 1 ? '治療' : '輸出',
					isDriver: false,
					isHelper: false,
					playerId: '',
					gearScore: ''
				})),
				departureDate: '',
				departureTime: '',
				changeLog: []
			}
		];
		activeGroupId = '1';
		pendingUpdates.clear();
	}

	function addNewGroup() {
		if (!isAdmin) {
			status = '❌ 只有管理員可以添加團隊';
			setTimeout(() => (status = ''), 2000);
			return;
		}
		// 找出最大的 ID 號碼，然後 +1
		const maxId = groups.reduce((max, g) => Math.max(max, parseInt(g.id) || 0), 0);
		const newId = (maxId + 1).toString();
		groups = [
			...groups,
			{
				id: newId,
				members: Array.from({ length: GROUP_SIZE }, (_, i) => ({
					profession: i === 0 ? '坦克' : i === 1 ? '治療' : '輸出',
					isDriver: false,
					isHelper: false,
					playerId: '',
					gearScore: ''
				})),
				departureDate: '',
				departureTime: '',
				changeLog: [
					{
						id: crypto.randomUUID(),
						timestamp: new Date(),
						gameId,
						action: '建立團隊',
						details: `團隊建立`
					}
				]
			}
		];
		activeGroupId = newId;
		renumberGroups();
		saveGroupsToLocalStorage(); // 儲存資料
	}

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
		saveGroupsToLocalStorage(); // 儲存資料
	}

	// 重新編號所有團隊，從 1 開始
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
	}

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

					// 清除舊的 timeout
					if (pendingUpdates.has(key)) {
						clearTimeout(pendingUpdates.get(key)!.timeout);
					}

					// 立即提交變動
					const pending: PendingUpdate = {
						groupId,
						field: field as string,
						oldValue: oldValue || '',
						newValue: value
					};

					pendingUpdates.set(key, pending);
					commitPendingUpdate(key);
				}
			}
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

			// 清除舊的 timeout
			if (pendingUpdates.has(key)) {
				clearTimeout(pendingUpdates.get(key)!.timeout);
			}

			// 立即提交變動
			const pending: PendingUpdate = {
				groupId,
				index,
				field: field as string,
				oldValue: oldMember[field as keyof GroupMember],
				newValue: value
			};

			pendingUpdates.set(key, pending);
			commitPendingUpdate(key);
		}
	}

	function getActiveGroup() {
		return groups.find((g) => g.id === activeGroupId) || groups[0];
	}

	function updateGroupDate(groupId: string, value: string) {
		const oldDate = groups.find((g) => g.id === groupId)?.departureDate;
		groups = groups.map((g) => (g.id === groupId ? { ...g, departureDate: value } : g));
		if (oldDate !== value) {
			const key = `date-${groupId}`;

			// 清除舊的 timeout
			if (pendingUpdates.has(key)) {
				clearTimeout(pendingUpdates.get(key)!.timeout);
			}

			const pending: PendingUpdate = {
				groupId,
				field: 'departureDate',
				oldValue: oldDate || '',
				newValue: value
			};

			pendingUpdates.set(key, pending);
			commitPendingUpdate(key);
			saveGroupsToLocalStorage(); // 儲存資料
		}
	}

	function updateGroupTime(groupId: string, value: string) {
		const oldTime = groups.find((g) => g.id === groupId)?.departureTime;
		groups = groups.map((g) => (g.id === groupId ? { ...g, departureTime: value } : g));
		if (oldTime !== value) {
			const key = `time-${groupId}`;

			// 清除舊的 timeout
			if (pendingUpdates.has(key)) {
				clearTimeout(pendingUpdates.get(key)!.timeout);
			}

			const pending: PendingUpdate = {
				groupId,
				field: 'departureTime',
				oldValue: oldTime || '',
				newValue: value
			};

			pendingUpdates.set(key, pending);
			commitPendingUpdate(key);
			saveGroupsToLocalStorage(); // 儲存資料
		}
	}

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
</script>

<svelte:head>
	<title>批次團隊填寫（10 人）</title>
</svelte:head>

{#if !isLoggedIn}
	<div class="login-container">
		<div class="login-card">
			<div class="login-header">
				<h1>⚔️ 團隊管理系統</h1>
				<p class="login-subtitle">請先登入以開始管理您的團隊</p>
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
					<span class="login-label-text">遊戲暱稱 <span class="required">*</span></span>
					<input
						type="text"
						class="login-input"
						placeholder="請輸入您的遊戲暱稱"
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

			<div class="login-footer">
				<p>💡 提示：無密碼登入為一般玩家，輸入密碼登入為管理員</p>
			</div>
		</div>
	</div>
{:else}
	<div class="container">
		<header>
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
					<span class="nav-user">{isAdmin ? `👑 ${gameId}` : gameId}</span>
					<span class="nav-role">{isAdmin ? '管理員' : '一般玩家'}</span>
					<button class="nav-logout" onclick={logout}>登出</button>
				</div>
			</nav>
			<!-- header-content removed: user info moved into nav -->
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
			<div class="tabs-header">
				<div class="tabs">
					{#each groups as group (group.id)}
						<button
							class="tab"
							class:active={activeGroupId === group.id}
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
					{#if activeTab === 'forms' && isAdmin}
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
								<span class="weekday">{getGroupWeekday(getActiveGroup())}</span>
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
												placeholder="遊戲暱稱"
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
											<span class="badge badge-date">📅 {entry.action}</span>
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
		</section>
	</div>
{/if}
