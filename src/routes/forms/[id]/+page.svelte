<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser, dev } from '$app/environment';
	import { enterRoom } from '$lib/room';
	import { page } from '$app/stores';
	import { LiveObject, LiveList } from '@liveblocks/client';
	import { parseRemoteGroups } from '$lib/types';
	import { toLiveGroup } from '$lib/liveblocks';

	interface GroupMember {
		id: string;
		order?: number;
		pinned?: boolean;
		profession: string;
		isDriver: boolean;
		isHelper: boolean;
		playerId: string;
		gearScore: string | number;
	}

	interface LocalGroup {
		id: string;
		order?: number;
		members: GroupMember[];
		departureTime?: string;
		departureDate?: string;
		status?: string;
		dungeonName?: string;
		level?: string;
		gearScoreReq?: string;
		contentType?: string;
		notes?: string;
		changeLog?: ChangeLog[];
	}

	type LiveGroupMember = {
		id: string;
		order?: number;
		pinned?: boolean;
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
		actorId?: string;
		action: string;
		details: string;
		targetType?: 'group' | 'member';
		targetId?: string;
		field?: string;
		oldValue?: string | number | boolean;
		newValue?: string | number | boolean;
	};

	type LiveGroup = {
		id: string;
		order?: number;
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
		actorId?: string; // actor alias
		action: string; // 「添加團隊」、「刪除團隊」、「更新成員」、「更新發車時間」等
		details: string; // 詳細描述
		targetType?: 'group' | 'member';
		targetId?: string;
		field?: string;
		oldValue?: string | number | boolean;
		newValue?: string | number | boolean;
	}

	// ---- 常數與共用工具 ----
	const GROUP_SIZE = 10;
	const MAX_CHANGELOG_ENTRIES = 100; // 最多保留 100 筆記錄
	const PENDING_UPDATE_DELAY = 3000; // 等待 3 秒合併多次輸入，減少紀錄雜訊

	// 將欄位對應為中文標籤，供變更紀錄使用（已本地化名稱）
	const FIELD_LABELS: Record<string, string> = {
		profession: '職業',
		isDriver: '隊長',
		isHelper: '幫打',
		playerId: '玩家 ID',
		gearScore: '裝備分數',
		departureDate: '開團日期',
		departureTime: '開團時間',
		contentType: '活動類型',
		level: '角色等級',
		notes: '備註'
	};

	// 產生 10 人的預設成員列表（坦/奶/輸出各一，其他為輸出）
	function buildDefaultMembers(): GroupMember[] {
		return Array.from({ length: GROUP_SIZE }, (_, i) => ({
			id:
				(
					globalThis as unknown as { crypto?: { randomUUID?: () => string } }
				).crypto?.randomUUID?.() ?? `m-${Date.now()}-${i}`,
			profession: i === 0 ? '坦克' : i === 1 ? '治療' : '輸出',
			isDriver: false,
			isHelper: false,
			pinned: false,
			playerId: '',
			gearScore: ''
		}));
	}

	// 建立一個空團隊，並可選擇帶入初始變更紀錄
	function createEmptyGroup(id?: string, changeLogEntry?: ChangeLog): LocalGroup {
		const gid =
			id ||
			((
				globalThis as unknown as { crypto?: { randomUUID?: () => string } }
			).crypto?.randomUUID?.() ??
				`g-${Date.now()}`);
		return {
			id: gid,
			members: buildDefaultMembers(),
			notes: '',
			status: '招募中',
			departureDate: '',
			departureTime: '',
			changeLog: changeLogEntry ? [changeLogEntry] : []
		};
	}

	interface PendingUpdate {
		groupId: string;
		index?: number; // 保留以支援顯示位置，但關鍵使用 memberId
		memberId?: string;
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

	// 自製刪除確認對話框 state
	let pendingDeleteGroupId: string | null = null;

	// 自製「立即清空」確認對話框 state
	let pendingImmediateClear = false;

	const initialGroup = createEmptyGroup();
	let groups: LocalGroup[] = [initialGroup]; // 本地表單資料，鏡像 Liveblocks 儲存層
	let activeGroupId = initialGroup.id; // 當前操作中的團隊 ID

	// 同步排程/防回圈旗標
	const SYNC_DEBOUNCE_MS = 700;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const syncGroupTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	let globalSyncTimeout: ReturnType<typeof setTimeout> | null = null;
	let localWriteInProgress = false;

	// Liveblocks 儲存層初始化與同步
	let storageInitialized = false;
	let storageRoot: LiveObject<LiveRoot> | null = null;

	// 週期性自動刷新（每週日 20:00）
	let weeklyRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
	let weeklyRefreshInterval: ReturnType<typeof setInterval> | null = null;

	function computeNextSunday20() {
		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth();
		const date = now.getDate();
		const day = now.getDay();
		const daysUntilSunday = (7 - day) % 7;
		// candidate for this week's Sunday at 20:00
		const candidate = new Date(year, month, date + daysUntilSunday, 20, 0, 0, 0);
		if (candidate.getTime() > now.getTime()) {
			return candidate.getTime() - now.getTime();
		}
		// otherwise next week's Sunday
		const next = new Date(
			year,
			month,
			date + (daysUntilSunday === 0 ? 7 : daysUntilSunday),
			20,
			0,
			0,
			0
		);
		return next.getTime() - now.getTime();
	}

	async function performWeeklyRefresh() {
		// behaviour: clear all form contents for every group while keeping the same
		// number of groups and preserving any member with pinned === true
		if (!storageInitialized || !storageRoot) {
			status = '無法自動清空：儲存尚未就緒';
			setTimeout(() => (status = ''), 4000);
			return;
		}

		try {
			// build cleared groups locally: keep id/order/changeLog but clear fields
			const cleared = groups.map((g) => {
				const clearedMembers = (g.members || []).map((m) => {
					if (m.pinned) return m; // preserve pinned member entirely
					return {
						...m,
						profession: '',
						isDriver: false,
						isHelper: false,
						playerId: '',
						gearScore: ''
					};
				});

				// append an automated changelog entry indicating weekly clear
				const autoLog: ChangeLog = {
					id: crypto.randomUUID(),
					timestamp: new Date(),
					gameId: 'system',
					actorId: 'system',
					action: '自動清空',
					details: '週期性自動清空表單（保留已鎖定成員）',
					targetType: 'group',
					targetId: g.id
				};

				return {
					...g,
					members: clearedMembers,
					departureDate: '',
					departureTime: '',
					dungeonName: '',
					level: '',
					gearScoreReq: '',
					contentType: '',
					status: '招募中',
					changeLog: [autoLog, ...(g.changeLog || [])].slice(0, MAX_CHANGELOG_ENTRIES)
				} as LocalGroup;
			});

			// ensure team count unchanged (we only worked on local groups)
			if (cleared.length !== groups.length) {
				status = '自動清空中發現團隊數異常，已中止';
				setTimeout(() => (status = ''), 5000);
				return;
			}

			groups = cleared;
			// push cleared state to storage
			scheduleFullSync();

			// 不顯示成功提示，避免干擾使用者操作（UI 無需顯示自動清空成功訊息）
		} catch (e) {
			console.error('performWeeklyRefresh error', e);
			status = '自動清空失敗，請稍後手動處理';
			setTimeout(() => (status = ''), 4000);
		}
	}

	function scheduleWeeklyRefresh() {
		// clear existing
		if (weeklyRefreshTimeout) clearTimeout(weeklyRefreshTimeout);
		if (weeklyRefreshInterval) clearInterval(weeklyRefreshInterval);
		const delay = computeNextSunday20();
		weeklyRefreshTimeout = setTimeout(() => {
			performWeeklyRefresh();
			// afterwards set interval every 7 days
			weeklyRefreshInterval = setInterval(performWeeklyRefresh, 7 * 24 * 60 * 60 * 1000);
		}, delay);
	}

	// `toLiveGroup` 已移至 `src/lib/liveblocks.ts`，在此匯入使用

	// Push local state into Liveblocks storage once initialized
	// 儲存初始化後，將本地資料寫回 Liveblocks
	// schedule a full sync (debounced)
	function scheduleFullSync() {
		if (!storageInitialized || !storageRoot) return;
		if (globalSyncTimeout) clearTimeout(globalSyncTimeout as unknown as number);
		globalSyncTimeout = setTimeout(() => {
			performFullSync();
		}, SYNC_DEBOUNCE_MS);
	}

	function performFullSync() {
		if (!storageInitialized || !storageRoot) return;
		try {
			localWriteInProgress = true;
			const liveGroups = new LiveList<LiveObject<LiveGroup>>(
				groups.map((g) => toLiveGroup(g) as unknown as LiveObject<LiveGroup>)
			);
			storageRoot!.set('groups', liveGroups);
			setTimeout(() => (localWriteInProgress = false), SYNC_DEBOUNCE_MS + 200);
		} catch (e) {
			console.error('performFullSync error', e);
			localWriteInProgress = false;
		}
	}

	// schedule single-group sync (debounced); replace only target group on storage
	function scheduleSyncGroup(groupId: string) {
		if (!storageInitialized || !storageRoot) return;
		if (syncGroupTimeouts.has(groupId)) clearTimeout(syncGroupTimeouts.get(groupId)!);
		syncGroupTimeouts.set(
			groupId,
			setTimeout(() => {
				syncSingleGroupToStorage(groupId);
				syncGroupTimeouts.delete(groupId);
			}, SYNC_DEBOUNCE_MS)
		);
	}

	function syncSingleGroupToStorage(groupId: string) {
		if (!storageInitialized || !storageRoot) return;
		try {
			localWriteInProgress = true;
			const immutable = (storageRoot as LiveObject<LiveRoot>).toImmutable();
			const remoteGroups = (immutable.groups || []) as unknown[];
			const newLiveGroups = new LiveList<LiveObject<LiveGroup>>(
				remoteGroups.map((rg) => {
					const rr = rg as Record<string, unknown>;
					if (String(rr.id ?? '') === groupId) {
						const localGroup = groups.find((g) => g.id === groupId)!;
						return toLiveGroup(localGroup) as unknown as LiveObject<LiveGroup>;
					}
					// keep remote group as-is by reconstructing same shape
					return new LiveObject<LiveGroup>({
						id: String(rr.id ?? ''),
						order: Number(rr.order ?? 0),
						members: new LiveList<LiveObject<LiveGroupMember>>(
							(((rr.members ?? []) as unknown[]) || []).map((m: unknown) => {
								const mm = m as Record<string, unknown>;
								return new LiveObject<LiveGroupMember>({
									id: String(mm.id ?? ''),
									order: typeof mm.order === 'number' ? Number(mm.order) : 0,
									pinned: !!mm.pinned,
									profession: String(mm.profession ?? ''),
									isDriver: !!mm.isDriver,
									isHelper: !!mm.isHelper,
									playerId: String(mm.playerId ?? ''),
									gearScore: (mm.gearScore as string | number | undefined) ?? ''
								});
							})
						),
						departureDate: String(rr.departureDate ?? ''),
						departureTime: String(rr.departureTime ?? ''),
						status: String(rr.status ?? '招募中'),
						dungeonName: String(rr.dungeonName ?? ''),
						level: String(rr.level ?? ''),
						gearScoreReq: String(rr.gearScoreReq ?? ''),
						contentType: String(rr.contentType ?? ''),
						changeLog: new LiveList<LiveObject<LiveChangeLog>>(
							(((rr.changeLog ?? []) as unknown[]) || []).map((c: unknown) => {
								const cc = c as Record<string, unknown>;
								return new LiveObject<LiveChangeLog>({
									id: String(cc.id ?? ''),
									timestamp: new Date(String(cc.timestamp)).toISOString(),
									gameId: String(cc.gameId ?? ''),
									actorId: String(cc.actorId ?? cc.gameId ?? ''),
									action: String(cc.action ?? ''),
									details: String(cc.details ?? ''),
									targetType: (cc.targetType as 'group' | 'member') ?? undefined,
									targetId: String(cc.targetId ?? ''),
									field: String(cc.field ?? ''),
									oldValue: cc.oldValue as string | number | boolean | undefined,
									newValue: cc.newValue as string | number | boolean | undefined
								});
							})
						)
					});
				})
			);
			storageRoot.set('groups', newLiveGroups);
			setTimeout(() => (localWriteInProgress = false), SYNC_DEBOUNCE_MS + 200);
		} catch (e) {
			console.error('syncSingleGroupToStorage error', e);
			localWriteInProgress = false;
		}
	}

	// 讀取儲存層中的 groups 並映射到本地 groups（登入時主動呼叫）
	function loadGroupsFromStorageOnce() {
		if (!storageInitialized || !storageRoot) return;
		try {
			const immutable = (storageRoot as LiveObject<LiveRoot>).toImmutable();
			const groupsPlain = immutable.groups;
			if (groupsPlain) {
				// 使用 parseRemoteGroups 將 unknown 資料轉為 LocalGroup[]
				const parsed = parseRemoteGroups(groupsPlain as unknown);
				if (parsed.length > 0) {
					groups = mergeRemoteWithLocal(parsed);
				}
				if (!groups.find((g) => g.id === activeGroupId)) {
					activeGroupId = groups[0]?.id || '1';
				}
			}
		} catch (e) {
			console.error('loadGroupsFromStorageOnce error', e);
		}
	}

	// 在登入後確保儲存層已初始化後載入 groups
	function ensureLoadGroupsAfterLogin() {
		if (storageInitialized) {
			loadGroupsFromStorageOnce();
			return;
		}
		const interval = setInterval(() => {
			if (storageInitialized) {
				clearInterval(interval);
				loadGroupsFromStorageOnce();
			}
		}, 200);
		// 最多等 5 秒
		setTimeout(() => clearInterval(interval), 5000);
	}

	// 加入房間、串接 presence 與 storage 訂閱，並在卸載時清理
	onMount(async () => {
		// 依路由參數設定房間名稱
		const unsubPage = page.subscribe((p) => {
			let rn = (p.params?.id as string) || 'my-room';
			if (dev) rn = `${rn}-dev`;
			roomName = rn;
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

			// 當儲存就緒時啟動週期性自動刷新排程
			scheduleWeeklyRefresh();

			// 若尚未存在 groups，初始化一次
			try {
				const existing = storageRoot.get('groups');
				if (!existing) {
					storageRoot.set(
						'groups',
						new LiveList<LiveObject<LiveGroup>>(
							groups.map((g) => toLiveGroup(g) as unknown as LiveObject<LiveGroup>)
						)
					);
				}
			} catch (e) {
				console.error('storage groups init error', e);
			}

			// Liveblocks Storage -> 本地 state，保持雙向同步
			// Liveblocks 儲存層變動同步回本地狀態，保持雙向一致
			const unsubscribeStorage = room.subscribe(storageRoot!, () => {
				try {
					if (localWriteInProgress) return; // 忽略來自本地寫入觸發的事件
					const immutable = (storageRoot as LiveObject<LiveRoot>).toImmutable();
					const groupsPlain = immutable.groups;
					if (groupsPlain) {
						const parsed = parseRemoteGroups(groupsPlain as unknown);
						if (parsed.length > 0) {
							groups = mergeRemoteWithLocal(parsed);
						}
						if (!groups.find((g) => g.id === activeGroupId)) {
							activeGroupId = groups[0]?.id || initialGroup.id;
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
				// clear weekly timers
				if (weeklyRefreshTimeout) clearTimeout(weeklyRefreshTimeout);
				if (weeklyRefreshInterval) clearInterval(weeklyRefreshInterval);
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
			// 成員詳細記錄 — 使用 memberId 以避免 index 不穩
			let memberIndex = pending.index;
			if (pending.memberId) {
				memberIndex = group.members.findIndex((m) => m.id === pending.memberId);
			}
			const displayIndex = (memberIndex ?? 0) >= 0 ? (memberIndex ?? 0) + 1 : '?';
			// 新格式：例如：成員 2 的玩家 ID 更新：00000 → 00000
			details = `成員 ${displayIndex} 的 ${fieldLabel} 更新：${String(pending.oldValue)} → ${String(
				pending.newValue
			)}`;
		} else {
			// 團隊級欄位
			if (pending.field === 'departureDate') {
				action = '更新發車日期';
			} else if (pending.field === 'departureTime') {
				action = '更新發車時間';
			} else if (pending.field === 'status') {
				action = '更新狀態';
			}
			// 新格式：例如：發車日期 更新：2025-01-01 → 2025-01-02
			details = `${fieldLabel} 更新：${String(pending.oldValue)} → ${String(pending.newValue)}`;
		}

		group.changeLog = [
			{
				id: crypto.randomUUID(),
				timestamp: new Date(),
				gameId,
				actorId: gameId,
				action,
				details,
				targetType: (pending.index !== undefined ? 'member' : 'group') as 'member' | 'group',
				targetId: pending.memberId ?? group.id,
				field: pending.field,
				oldValue: pending.oldValue as string | number | boolean | undefined,
				newValue: pending.newValue as string | number | boolean | undefined
			},
			...(group.changeLog || [])
		].slice(0, MAX_CHANGELOG_ENTRIES);

		groups = groups; // 觸發 Svelte 反應式更新
		pendingUpdates.delete(key);

		// 合併並同步此團隊的 changeLog 到儲存層，避免覆寫遠端其他使用者的變更
		mergeAndSyncGroupChangeLog(group.id);
	}

	// 合併遠端與本地指定團隊的 changeLog，然後寫回儲存層
	function mergeAndSyncGroupChangeLog(groupId: string) {
		if (!storageInitialized || !storageRoot) return;
		try {
			const immutable = (storageRoot as LiveObject<LiveRoot>).toImmutable();
			const remoteGroups = (immutable.groups || []) as unknown as Array<Record<string, unknown>>;
			const localGroup = groups.find((g) => g.id === groupId);
			if (!localGroup) return;
			const remoteGroup = remoteGroups.find(
				(rg) => String((rg as Record<string, unknown>).id ?? '') === groupId
			);
			if (!remoteGroup) {
				// 若遠端不存在該團隊，直接同步整個本地清單
				scheduleFullSync();
				return;
			}

			const remoteCL = ((remoteGroup as Record<string, unknown>).changeLog ?? []) as unknown[];
			const localCL = (localGroup.changeLog || []) as ChangeLog[];
			const mergedMap: Record<string, ChangeLog> = {};
			for (const c of remoteCL) {
				try {
					const cc = c as Record<string, unknown>;
					mergedMap[String(cc.id ?? '')] = {
						id: String(cc.id ?? ''),
						timestamp: cc.timestamp ? new Date(String(cc.timestamp)) : new Date(),
						gameId: String(cc.gameId ?? ''),
						action: String(cc.action ?? ''),
						details: String(cc.details ?? '')
					};
				} catch {
					// ignore
				}
			}
			for (const c of localCL) mergedMap[String(c.id)] = c;
			const merged = Object.values(mergedMap)
				.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
				.slice(0, MAX_CHANGELOG_ENTRIES);

			const newLiveGroups = new LiveList<LiveObject<LiveGroup>>(
				remoteGroups.map((rg) => {
					const rr = rg as Record<string, unknown>;
					if (String(rr.id ?? '') === groupId) {
						return new LiveObject<LiveGroup>({
							id: localGroup.id,
							members: new LiveList<LiveObject<LiveGroupMember>>(
								(localGroup.members || []).map(
									(m) =>
										new LiveObject<LiveGroupMember>({
											order: typeof m.order === 'number' ? m.order : 0,
											id: m.id,
											pinned: !!m.pinned,
											profession: m.profession,
											isDriver: !!m.isDriver,
											isHelper: !!m.isHelper,
											playerId: m.playerId || '',
											gearScore: m.gearScore || ''
										})
								)
							),
							departureDate: localGroup.departureDate || '',
							departureTime: localGroup.departureTime || '',
							status: localGroup.status || '招募中',
							dungeonName: localGroup.dungeonName || '',
							level: localGroup.level || '',
							gearScoreReq: localGroup.gearScoreReq || '',
							contentType: localGroup.contentType || '',
							changeLog: new LiveList<LiveObject<LiveChangeLog>>(
								merged.map(
									(c) =>
										new LiveObject<LiveChangeLog>({
											id: c.id,
											timestamp: new Date(c.timestamp).toISOString(),
											gameId: c.gameId,
											actorId: c.actorId ?? c.gameId,
											action: c.action,
											details: c.details,
											targetType: c.targetType ?? undefined,
											targetId: c.targetId ?? undefined,
											field: c.field ?? undefined,
											oldValue: c.oldValue ?? undefined,
											newValue: c.newValue ?? undefined
										})
								)
							)
						});
					}
					// non-target group: reconstruct from remote
					return new LiveObject<LiveGroup>({
						id: String(rr.id ?? ''),
						members: new LiveList<LiveObject<LiveGroupMember>>(
							(((rr.members ?? []) as unknown[]) || []).map((m: unknown) => {
								const mm = m as Record<string, unknown>;
								return new LiveObject<LiveGroupMember>({
									id: String(mm.id ?? ''),
									pinned: !!mm.pinned,
									profession: String(mm.profession ?? ''),
									isDriver: !!mm.isDriver,
									isHelper: !!mm.isHelper,
									playerId: String(mm.playerId ?? ''),
									gearScore: (mm.gearScore as string | number | undefined) ?? ''
								});
							})
						),
						departureDate: String(rr.departureDate ?? ''),
						departureTime: String(rr.departureTime ?? ''),
						status: String(rr.status ?? '招募中'),
						dungeonName: String(rr.dungeonName ?? ''),
						level: String(rr.level ?? ''),
						gearScoreReq: String(rr.gearScoreReq ?? ''),
						contentType: String(rr.contentType ?? ''),
						changeLog: new LiveList<LiveObject<LiveChangeLog>>(
							(((rr.changeLog ?? []) as unknown[]) || []).map((c: unknown) => {
								const cc = c as Record<string, unknown>;
								return new LiveObject<LiveChangeLog>({
									id: String(cc.id ?? ''),
									timestamp: new Date(String(cc.timestamp)).toISOString(),
									gameId: String(cc.gameId ?? ''),
									actorId: String(cc.actorId ?? cc.gameId ?? ''),
									action: String(cc.action ?? ''),
									details: String(cc.details ?? ''),
									targetType: (cc.targetType as 'group' | 'member') ?? undefined,
									targetId: String(cc.targetId ?? ''),
									field: String(cc.field ?? ''),
									oldValue: cc.oldValue as string | number | boolean | undefined,
									newValue: cc.newValue as string | number | boolean | undefined
								});
							})
						)
					});
				})
			);
			storageRoot.set('groups', newLiveGroups);
		} catch (e) {
			console.error('mergeAndSyncGroupChangeLog error', e);
			// fallback to full sync
			scheduleFullSync();
		}
	}

	// 驗證遊戲暱稱 / 密碼，成功後切換登入狀態
	async function handleLogin() {
		if (!browser) return; // SSR 不呼叫 fetch，僅在瀏覽器執行
		if (!gameId.trim()) {
			status = '❌ 請輸入遊戲暱稱';
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
				// 登入成功後立即嘗試從儲存層載入現有的 groups
				ensureLoadGroupsAfterLogin();
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
		groups = [createEmptyGroup()];
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
		// 使用 UUID 當作群組 ID（避免多人情境下重排造成衝突）
		const newId =
			(
				globalThis as unknown as { crypto?: { randomUUID?: () => string } }
			).crypto?.randomUUID?.() ?? `g-${Date.now()}`;
		const creationLog: ChangeLog = {
			id: crypto.randomUUID(),
			timestamp: new Date(),
			gameId,
			action: '建立團隊',
			details: '團隊建立'
		};
		const newGroup = createEmptyGroup(newId, creationLog);
		groups = [...groups, newGroup];
		// 新增時以全量 sync，保證順序與顯示一致
		scheduleFullSync();
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
		if (activeGroupId === groupId) activeGroupId = groups[0]?.id || initialGroup.id;
		// 刪除時也執行全量 sync
		scheduleFullSync();
	}

	// 重新編號所有團隊，從 1 開始並保留活躍索引
	// renumberGroups 已移除 — 使用 UUID 作為永久 id，UI 顯示使用陣列序號

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

			// 使用單 group 排程同步，避免每次輸入都寫入整個 storage
			scheduleSyncGroup(groupId);
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
			const memberId = oldMember.id;
			const key = `${groupId}-${memberId}-${field}`;

			// 清除舊的計時器
			if (pendingUpdates.has(key)) {
				clearTimeout(pendingUpdates.get(key)!.timeout);
			}

			// 記錄未提交的變動（使用 memberId 作為關鍵）
			const pending: PendingUpdate = {
				groupId,
				index,
				memberId,
				field: field as string,
				oldValue: (oldMember[field as keyof GroupMember] ?? '') as string | number | boolean,
				newValue: value,
				timeout: setTimeout(() => commitPendingUpdate(key), PENDING_UPDATE_DELAY)
			};

			pendingUpdates.set(key, pending);
		}

		// 使用單群組同步，避免覆寫其他使用者的變更
		scheduleSyncGroup(groupId);
	}

	// 強制整數並 clamp 等級到 0..100，空字串保留為空 — 會直接覆寫 input 的值以防止繼續輸入
	function clampLevelInput(e: Event, groupId: string) {
		const input = e.target as HTMLInputElement;
		const raw = (input.value ?? '').toString().trim();
		if (raw === '') {
			updateGroupField(groupId, undefined, 'level', '');
			return;
		}
		let n = Math.floor(Number(raw));
		if (!Number.isFinite(n) || Number.isNaN(n)) n = 0;
		n = Math.max(0, Math.min(100, n));
		input.value = String(n);
		updateGroupField(groupId, undefined, 'level', String(n));
	}

	// 強制整數並 clamp 裝分到 0..99999（團級）— 直接覆寫 input 值
	function clampGearScoreReqInput(e: Event, groupId: string) {
		const input = e.target as HTMLInputElement;
		const raw = (input.value ?? '').toString().trim();
		if (raw === '') {
			updateGroupField(groupId, undefined, 'gearScoreReq', '');
			return;
		}
		let n = Math.floor(Number(raw));
		if (!Number.isFinite(n) || Number.isNaN(n)) n = 0;
		n = Math.max(0, Math.min(99999, n));
		input.value = String(n);
		updateGroupField(groupId, undefined, 'gearScoreReq', String(n));
	}

	// 強制整數並 clamp 裝分到 0..99999（成員級）— 直接覆寫 input 值
	function clampMemberGearScoreInput(e: Event, groupId: string, index: number) {
		const input = e.target as HTMLInputElement;
		const raw = (input.value ?? '').toString().trim();
		if (raw === '') {
			updateGroupField(groupId, index, 'gearScore', '');
			return;
		}
		let n = Math.floor(Number(raw));
		if (!Number.isFinite(n) || Number.isNaN(n)) n = 0;
		n = Math.max(0, Math.min(99999, n));
		input.value = String(n);
		updateGroupField(groupId, index, 'gearScore', String(n));
	}

	function getActiveGroup() {
		return groups.find((g) => g.id === activeGroupId) || groups[0];
	}

	// Merge remote parsed groups into local groups but preserve locally-pinned member fields.
	function mergeRemoteWithLocal(remoteParsed: LocalGroup[]): LocalGroup[] {
		const out: LocalGroup[] = [];
		for (const rg of remoteParsed) {
			const local = groups.find((g) => g.id === rg.id);
			if (!local) {
				out.push(rg);
				continue;
			}
			const mergedMembers = (rg.members || []).map((m) => {
				const lm = local.members.find((x) => x.id === m.id);
				if (lm && lm.pinned) {
					// preserve pinned member's local editable fields
					return {
						...m,
						playerId: lm.playerId,
						gearScore: lm.gearScore,
						isDriver: lm.isDriver,
						isHelper: lm.isHelper,
						profession: lm.profession,
						pinned: lm.pinned
					} as typeof m;
				}
				return m;
			});
			out.push({ ...rg, members: mergedMembers });
		}
		return out;
	}

	function isGroupReadOnly(g: LocalGroup | undefined) {
		if (!g) return false;
		return g.status === '已準備' || g.status === '已出團';
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

		// 同步到儲存層（發車日期變更） - 單群組排程
		scheduleSyncGroup(groupId);
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

		// 同步到儲存層（發車時間變更） - 單群組排程
		scheduleSyncGroup(groupId);
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

		// 同步到儲存層（狀態變更） - 單群組排程
		scheduleSyncGroup(groupId);
	}

	// 用瀏覽器原生 Date 解析 YYYY-MM-DD，簡化可讀性
	function getGroupWeekday(g: LocalGroup) {
		const d = (g.departureDate || '').trim();
		if (!d) return '';
		const dt = new Date(d);
		if (Number.isNaN(dt.getTime())) return '';
		const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
		return weekdays[dt.getDay()];
	}

	function getGroupWeekdayIndex(g: LocalGroup) {
		const d = (g.departureDate || '').trim();
		if (!d) return -1;
		const dt = new Date(d);
		if (Number.isNaN(dt.getTime())) return -1;
		return dt.getDay();
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
							填寫報名表
						</button>
					</li>
					{#if isAdmin}
						<li class="nav-item">
							<button
								class="nav-link"
								class:active={activeTab === 'history'}
								onclick={() => (activeTab = 'history')}
							>
								變更紀錄
							</button>
						</li>
					{/if}
				</ul>
				<div class="nav-actions">
					<span class="nav-user" title={gameId || '訪客'}>{gameId || '訪客'}</span>
					<span class="nav-role">{isAdmin ? '管理員' : '一般玩家'}</span>
					{#if isAdmin}
						<button
							class="nav-clear"
							onclick={() => (pendingImmediateClear = true)}
							title="管理員：立即執行週期性清空"
						>
							立即清空
						</button>
					{/if}
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
						{#each groups as group, idx (group.id)}
							<button
								class="tab"
								class:active={activeGroupId === group.id}
								class:recruit={group.status === '招募中'}
								class:ready={group.status === '已準備'}
								class:done={group.status === '已出團'}
								onclick={() => (activeGroupId = group.id)}
							>
								團隊 {idx + 1}
								{#if activeTab === 'forms' && groups.length > 1 && isAdmin}
									{#if group.status !== '已準備'}
										<span
											class="tab-close"
											onclick={(e) => {
												e.stopPropagation();
												// open custom confirmation dialog
												pendingDeleteGroupId = group.id;
											}}
											onkeydown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.preventDefault();
													e.stopPropagation();
													pendingDeleteGroupId = group.id;
												}
											}}
											role="button"
											tabindex="0"
											title="刪除此團隊"
										>
											×
										</span>
									{/if}
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
						<div class="form-panel">
							{#if pendingDeleteGroupId}
								<div class="modal-backdrop" role="dialog" aria-modal="true">
									<div class="modal">
										<h3>確認刪除團隊</h3>
										<p>確定要刪除此團隊嗎？此操作會移除該團隊的所有資料（可在變更紀錄查看）。</p>
										<div class="modal-actions">
											<button
												class="btn btn-danger"
												onclick={() => {
													deleteGroup(pendingDeleteGroupId!);
													pendingDeleteGroupId = null;
												}}>確認刪除</button
											>
											<button class="btn" onclick={() => (pendingDeleteGroupId = null)}>取消</button
											>
										</div>
									</div>
								</div>
							{/if}

							{#if pendingImmediateClear}
								<div class="modal-backdrop" role="dialog" aria-modal="true">
									<div class="modal">
										<h3>確認立即清空</h3>
										<p>
											您確定要立即執行「立即清空」操作嗎？此操作會清空所有團隊的欄位，但會保留已鎖定的成員。
										</p>
										<div class="modal-actions">
											<button
												class="btn btn-danger"
												onclick={() => {
													performWeeklyRefresh();
													pendingImmediateClear = false;
												}}
											>
												執行清空
											</button>
											<button class="btn" onclick={() => (pendingImmediateClear = false)}
												>取消</button
											>
										</div>
									</div>
								</div>
							{/if}
							{#if isGroupReadOnly(getActiveGroup())}
								<div class="readonly-overlay" aria-hidden="true"></div>
							{/if}
							<div class="departure-time-row">
								<label class="departure-label">
									<input
										class="departure-input departure-date"
										type="date"
										aria-label="開團日期"
										value={getActiveGroup().departureDate ?? ''}
										onchange={(e) =>
											updateGroupDate(activeGroupId, (e.target as HTMLInputElement).value)}
										disabled={isGroupReadOnly(getActiveGroup())}
									/>
								</label>
								<label class="departure-label">
									<input
										class="departure-input departure-time"
										type="time"
										aria-label="開團時間"
										value={getActiveGroup().departureTime ?? ''}
										onchange={(e) =>
											updateGroupTime(activeGroupId, (e.target as HTMLInputElement).value)}
										disabled={isGroupReadOnly(getActiveGroup())}
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
										disabled={isGroupReadOnly(getActiveGroup())}
									/>
								</label>
								<label class="departure-label">
									<input
										class="departure-input level"
										type="number"
										min="0"
										max="100"
										style="width:5.5rem; max-width:100%"
										aria-label="等級"
										placeholder="等級"
										value={getActiveGroup().level ?? ''}
										oninput={(e) => clampLevelInput(e, activeGroupId)}
										disabled={isGroupReadOnly(getActiveGroup())}
									/>
									{#if String(getActiveGroup().level ?? '') !== '' && Number(getActiveGroup().level) > 100}
										<div class="field-error">等級上限為 100</div>
									{/if}
								</label>
								<label class="departure-label">
									<input
										class="departure-input gear-score-req"
										type="text"
										aria-label="裝分限制"
										placeholder="裝分限制"
										value={getActiveGroup().gearScoreReq ?? ''}
										oninput={(e) => clampGearScoreReqInput(e, activeGroupId)}
										disabled={isGroupReadOnly(getActiveGroup())}
									/>
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
										class:readonly-active={isGroupReadOnly(getActiveGroup())}
									>
										<option value="招募中">招募中</option>
										<option value="已準備">已準備</option>
										<option value="已出團">已出團</option>
									</select>
								</label>
							</div>
							<!-- keep group-grid inside form-panel so overlay covers members -->
							<div class="group-grid">
								{#each getActiveGroup().members as member, index (member.id)}
									<div class="member-card">
										<div class="member-header">
											<button
												type="button"
												class="member-number"
												class:pinned={member.pinned}
												class:disabled={!isAdmin}
												disabled={!isAdmin}
												aria-pressed={!!member.pinned}
												title={isAdmin
													? member.pinned
														? '已鎖定，刷新時會保留'
														: '點選以鎖定此成員'
													: '只有管理員可以鎖定成員'}
												onclick={() =>
													updateGroupField(activeGroupId, index, 'pinned', !member.pinned)}
											>
												{index + 1}
											</button>
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
														disabled={isGroupReadOnly(getActiveGroup())}
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
														disabled={isGroupReadOnly(getActiveGroup())}
													/>
													<span>🤝 幫打</span>
												</label>
											</div>
										</div>
										<div class="form-row">
											<div class="form-group">
												<label>
													<span class="label-text">職業</span>
													<select
														value={member.profession}
														onchange={(e) =>
															updateGroupField(
																activeGroupId,
																index,
																'profession',
																(e.target as HTMLSelectElement).value
															)}
														disabled={isGroupReadOnly(getActiveGroup())}
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
														disabled={isGroupReadOnly(getActiveGroup())}
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
														max="99999"
														placeholder="0"
														value={member.gearScore}
														oninput={(e) => clampMemberGearScoreInput(e, activeGroupId, index)}
														disabled={isGroupReadOnly(getActiveGroup())}
													/>
													{#if String(member.gearScore ?? '') !== '' && Number(member.gearScore) > 99999}
														<div class="field-error">裝分上限為 99,999</div>
													{/if}
												</label>
											</div>
										</div>
									</div>
								{/each}
							</div>

							<!-- 備註區 -->
							<div class="notes-area">
								<label class="notes-label">
									<textarea
										class="notes-input"
										placeholder="此團隊的備註（可留給管理員或臨時說明）"
										value={getActiveGroup().notes ?? ''}
										oninput={(e) =>
											updateGroupField(
												activeGroupId,
												undefined,
												'notes',
												(e.target as HTMLTextAreaElement).value
											)}
										disabled={isGroupReadOnly(getActiveGroup())}
									></textarea>
								</label>
							</div>
						</div>
					{/if}
				{:else if activeTab === 'history' && isAdmin}
					<section class="history-section">
						<div class="history-header-wrapper">
							<div class="history-stats">
								{#if (getActiveGroup()?.changeLog ?? []).length > 0}
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
											{:else if entry.action === '更新狀態'}
												<span class="badge badge-status">🔄 {entry.action}</span>
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
				{:else if activeTab === 'history' && !isAdmin}
					<section class="history-section">
						<div class="history-empty">
							<p class="history-note">🔒 權限不足</p>
							<p class="history-hint">只有管理員可以查看更改紀錄。</p>
							<button class="btn" onclick={() => (activeTab = 'forms')}>回到填寫表單</button>
						</div>
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
	/* Readonly overlay for form panel */
	.form-panel {
		position: relative;
	}

	.readonly-overlay {
		position: absolute;
		inset: 0;
		background: rgba(255, 255, 255, 0); /* 白色半透明 (不模糊) */
		z-index: 40;
		pointer-events: auto; /* 阻擋下層互動 */
	}

	/* Status select should be interactive above the overlay and visually prominent */
	.status-select.readonly-active {
		position: relative;
		z-index: 60; /* sit above overlay */
		opacity: 1; /* make it fully opaque */
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
	}

	/* Make disabled inputs look muted */
	input[disabled],
	select[disabled] {
		background-color: #f7f7f7;
		color: #555;
		cursor: not-allowed;
	}

	/* Inline field error */
	.field-error {
		color: #dc2626;
		font-size: 0.8rem;
		margin-top: 0.25rem;
	}

	/* simple modal styles for custom confirmation */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.45);
		z-index: 1200;
	}

	.modal {
		background: #fff;
		padding: 1.25rem;
		border-radius: 8px;
		max-width: 420px;
		width: 100%;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
	}

	.modal h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.05rem;
	}

	.modal p {
		margin: 0 0 1rem 0;
		color: #333;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.btn {
		padding: 0.5rem 0.9rem;
		border-radius: 6px;
		border: 1px solid #d1d5db;
		background: #fff;
		cursor: pointer;
	}

	.btn-danger {
		background: #dc2626;
		color: #fff;
		border-color: #dc2626;
	}

	/* Member number (clickable) - default blue, pinned -> red */
	.member-number {
		display: inline-block;
		width: 2rem;
		height: 2rem;
		line-height: 2rem;
		border-radius: 9999px;
		text-align: center;
		background: #e6f0ff;
		color: #2563eb;
		cursor: pointer;
		user-select: none;
		margin-right: 0.5rem;
		font-weight: 600;
	}

	.member-number:hover {
		filter: brightness(0.98);
	}

	.member-number.pinned {
		background: #fee2e2;
		color: #b91c1c;
		border: 1px solid #fca5a5;
	}

	.member-number.disabled {
		background: #f3f4f6;
		color: #9ca3af;
		cursor: default;
		border: 1px solid #e5e7eb;
	}

	.member-number:focus {
		outline: 2px solid rgba(37, 99, 235, 0.35);
		outline-offset: 2px;
	}

	/* Notes area horizontal layout */
	.notes-area {
		margin-top: 1rem;
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.notes-label {
		display: flex;
		align-items: flex-start;
		width: 100%;
		gap: 0.75rem;
	}

	.notes-input {
		flex: 1 1 auto;
		min-height: 3.25rem;
		max-height: 12rem;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		border: 1px solid #d1d5db;
		background: #fff;
		resize: vertical;
		font-size: 0.95rem;
	}

	.notes-input[disabled] {
		background: #f7f7f7;
		color: #6b7280;
		cursor: not-allowed;
	}

	/* 導覽列按鈕樣式：立即清空（危險/紅色）與登出（次要/藍色） */
	.nav-actions .nav-clear,
	.nav-actions .nav-logout {
		padding: 0.45rem 0.75rem;
		border-radius: 8px;
		border: 1px solid transparent;
		font-weight: 600;
		cursor: pointer;
		margin-left: 0.5rem;
		background: transparent;
		transition:
			transform 120ms ease,
			filter 120ms ease;
	}

	.nav-actions .nav-clear {
		background: linear-gradient(180deg, #fff1f2, #fee2e2);
		color: #b91c1c;
		border-color: #fca5a5;
	}

	.nav-actions .nav-clear:hover {
		filter: brightness(0.98);
		transform: translateY(-1px);
	}

	.nav-actions .nav-logout {
		background: linear-gradient(180deg, #eff6ff, #e6f0ff);
		color: #1e3a8a;
		border-color: #bfdbfe;
	}

	.nav-actions .nav-logout:hover {
		filter: brightness(0.98);
		transform: translateY(-1px);
	}

	.nav-actions .nav-clear:focus,
	.nav-actions .nav-logout:focus {
		outline: 2px solid rgba(37, 99, 235, 0.18);
		outline-offset: 2px;
	}
</style>
