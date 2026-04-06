import { useEffect, useMemo, useState } from 'react'
import { api, type CustomCharacterDraft, type CustomGameDraft, type GameInfo } from '../lib/api'
import { getCustomRoomGame, saveCustomRoomGame, buildCustomGameDetail } from '../lib/custom-room-game'
import {
  getRoomHistory,
  getStoredPlayerName,
  removeRoomHistory,
  setStoredPlayerName,
  type RoomHistoryEntry,
  upsertRoomHistory,
} from '../lib/room-history.js'
import './GameLobby.css'

const CUSTOM_TEMPLATE_NAME = 'custom-editor'

type LobbyMode = 'template' | 'custom'

interface EditableCharacterDraft extends CustomCharacterDraft {
  key: string
}

interface GameLobbyProps {
  onRoomCreated: (
    roomId: string,
    templateName: string,
    playerName: string,
    templateDisplayName?: string,
    npcBackend?: 'agent-runtime' | 'llm',
  ) => void
  onResumeRoom: (room: RoomHistoryEntry) => void
}

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp

  if (diff < 60_000) {
    return '刚刚玩过'
  }
  if (diff < 3_600_000) {
    return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`
  }
  if (diff < 86_400_000) {
    return `${Math.max(1, Math.floor(diff / 3_600_000))} 小时前`
  }
  if (diff < 604_800_000) {
    return `${Math.max(1, Math.floor(diff / 86_400_000))} 天前`
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function shortenRoomId(roomId: string) {
  return roomId.length > 14 ? `${roomId.slice(0, 6)}...${roomId.slice(-4)}` : roomId
}

function createEditableCharacterDraft(): EditableCharacterDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    description: '',
    personality: '',
  }
}

function sanitizeCharacters(characters: EditableCharacterDraft[]) {
  return characters
    .map((character) => ({
      name: character.name.trim(),
      description: character.description.trim(),
      personality: character.personality.trim(),
    }))
    .filter((character) => character.name && character.description && character.personality)
}

function hasPartialCharacterDraft(character: EditableCharacterDraft) {
  const fields = [character.name.trim(), character.description.trim(), character.personality.trim()]
  return fields.some(Boolean) && !fields.every(Boolean)
}

export function GameLobby({ onRoomCreated, onResumeRoom }: GameLobbyProps) {
  const [games, setGames] = useState<GameInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [hostName, setHostName] = useState(() => getStoredPlayerName())
  const [selectedGame, setSelectedGame] = useState<string | null>(null)
  const [mode, setMode] = useState<LobbyMode>('template')
  const [npcBackend, setNpcBackend] = useState<'agent-runtime' | 'llm'>('llm')
  const [creating, setCreating] = useState(false)
  const [recentRooms, setRecentRooms] = useState<RoomHistoryEntry[]>(() => getRoomHistory())
  const [resumeErrorByRoom, setResumeErrorByRoom] = useState<Record<string, string>>({})
  const [resumingRoomId, setResumingRoomId] = useState<string | null>(null)
  const [customTitle, setCustomTitle] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [customWorld, setCustomWorld] = useState('')
  const [playableCharacters, setPlayableCharacters] = useState<EditableCharacterDraft[]>([createEditableCharacterDraft()])
  const [npcCharacters, setNpcCharacters] = useState<EditableCharacterDraft[]>([createEditableCharacterDraft()])

  useEffect(() => {
    api
      .getGames()
      .then(({ games: nextGames }) => {
        setGames(nextGames)
        setSelectedGame((current) => current ?? nextGames.find((game) => game.roleMode === 'fixed')?.name ?? null)
        setLoading(false)
      })
      .catch((err) => {
        setLoadError(String(err))
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    setStoredPlayerName(hostName)
  }, [hostName])

  const fixedGames = games.filter((game) => game.roleMode === 'fixed')
  const trimmedHostName = hostName.trim()
  const trimmedCustomTitle = customTitle.trim()
  const trimmedCustomDescription = customDescription.trim()
  const trimmedCustomWorld = customWorld.trim()
  const sanitizedPlayableCharacters = useMemo(() => sanitizeCharacters(playableCharacters), [playableCharacters])
  const sanitizedNpcCharacters = useMemo(() => sanitizeCharacters(npcCharacters), [npcCharacters])
  const selectedTemplate = fixedGames.find((game) => game.name === selectedGame)
  const selectedPlayableCount = selectedTemplate?.characters.filter((character) => !character.isNpc).length ?? 0
  const selectedNpcCount = selectedTemplate?.characters.filter((character) => character.isNpc).length ?? 0
  const customPlayableCount = sanitizedPlayableCharacters.length
  const customNpcCount = sanitizedNpcCharacters.length
  const avatarText = trimmedHostName ? trimmedHostName.slice(0, 1).toUpperCase() : '你'
  const templateDisplayNames = useMemo(
    () => new Map(games.map((game) => [game.name, game.displayName])),
    [games],
  )
  const customErrors = useMemo(() => {
    const nextErrors: string[] = []

    if (!trimmedCustomTitle) {
      nextErrors.push('先给你的故事起一个标题。')
    }
    if (!trimmedCustomDescription) {
      nextErrors.push('补一句简介，方便选角页快速理解故事。')
    }
    if (!trimmedCustomWorld) {
      nextErrors.push('请填写世界背景或开场说明。')
    }
    if (customPlayableCount < 1) {
      nextErrors.push('至少准备 1 个可扮演角色。')
    }
    if (customNpcCount < 1) {
      nextErrors.push('至少准备 1 个 NPC。')
    }
    if (playableCharacters.some((character) => hasPartialCharacterDraft(character))) {
      nextErrors.push('可扮演角色里有未填写完整的条目，请补全或删除。')
    }
    if (npcCharacters.some((character) => hasPartialCharacterDraft(character))) {
      nextErrors.push('NPC 列表里有未填写完整的条目，请补全或删除。')
    }

    return nextErrors
  }, [
    customNpcCount,
    customPlayableCount,
    npcCharacters,
    playableCharacters,
    trimmedCustomDescription,
    trimmedCustomTitle,
    trimmedCustomWorld,
  ])

  const canCreate =
    mode === 'template'
      ? Boolean(selectedGame && trimmedHostName) && !creating
      : Boolean(trimmedHostName) && customErrors.length === 0 && !creating
  const previewTitle =
    mode === 'template' ? (selectedTemplate?.displayName ?? '还没选剧本模板') : (trimmedCustomTitle || '你的自定义故事')
  const previewMeta =
    mode === 'template'
      ? selectedTemplate
        ? `${selectedPlayableCount} 个可扮演角色 · ${selectedNpcCount} 个 NPC`
        : '固定角色模式，上手更轻松'
      : trimmedCustomDescription || '自由定义背景、角色与 NPC，开一个只属于你们的故事房间'

  const updateCharacterDraft = (
    kind: 'playable' | 'npc',
    key: string,
    field: keyof CustomCharacterDraft,
    value: string,
  ) => {
    const setter = kind === 'playable' ? setPlayableCharacters : setNpcCharacters

    setter((current) =>
      current.map((character) => (character.key === key ? { ...character, [field]: value } : character)),
    )
  }

  const appendCharacterDraft = (kind: 'playable' | 'npc') => {
    const setter = kind === 'playable' ? setPlayableCharacters : setNpcCharacters
    setter((current) => [...current, createEditableCharacterDraft()])
  }

  const removeCharacterDraft = (kind: 'playable' | 'npc', key: string) => {
    const setter = kind === 'playable' ? setPlayableCharacters : setNpcCharacters
    setter((current) => (current.length > 1 ? current.filter((character) => character.key !== key) : current))
  }

  const handleCreate = async () => {
    if (!trimmedHostName) {
      return
    }

    setCreating(true)
    setActionError(null)

    try {
      setStoredPlayerName(trimmedHostName)

      if (mode === 'template') {
        if (!selectedGame) {
          return
        }

          const { room } = await api.createRoom(selectedGame, trimmedHostName, npcBackend)
          onRoomCreated(
            room.id,
            room.gameTemplate || selectedGame,
            trimmedHostName,
            room.gameDisplayName || selectedTemplate?.displayName,
            room.npcBackend ?? npcBackend,
          )
          return
        }

      if (customErrors.length > 0) {
        return
      }

      const customGameDraft: CustomGameDraft = {
        title: trimmedCustomTitle,
        description: trimmedCustomDescription,
        worldMd: trimmedCustomWorld,
        playableCharacters: sanitizedPlayableCharacters,
        npcCharacters: sanitizedNpcCharacters,
      }
      const customGame = buildCustomGameDetail(customGameDraft)
      const { room } = await api.createCustomRoom(trimmedHostName, customGameDraft, npcBackend)

      saveCustomRoomGame(room.id, customGame)
      onRoomCreated(
        room.id,
        room.gameTemplate || CUSTOM_TEMPLATE_NAME,
        trimmedHostName,
        room.gameDisplayName || customGame.displayName,
        room.npcBackend ?? npcBackend,
      )
    } catch (err) {
      setActionError(String(err))
    } finally {
      setCreating(false)
    }
  }

  const handleRemoveRecentRoom = (roomId: string) => {
    setRecentRooms(removeRoomHistory(roomId))
    setResumeErrorByRoom((prev) => {
      if (!prev[roomId]) {
        return prev
      }

      const next = { ...prev }
      delete next[roomId]
      return next
    })
  }

  const handleResume = async (entry: RoomHistoryEntry) => {
    setResumingRoomId(entry.roomId)
    setResumeErrorByRoom((prev) => {
      if (!prev[entry.roomId]) {
        return prev
      }

      const next = { ...prev }
      delete next[entry.roomId]
      return next
    })

    try {
      const { room } = await api.getRoom(entry.roomId)
      const customRoomGame = getCustomRoomGame(entry.roomId)
        const nextEntry = {
          ...entry,
          templateName: room.gameTemplate || entry.templateName,
          templateDisplayName:
            room.gameDisplayName ??
          entry.templateDisplayName ??
            customRoomGame?.displayName ??
            templateDisplayNames.get(room.gameTemplate || entry.templateName),
          npcBackend: room.npcBackend ?? entry.npcBackend,
          playerName: entry.playerName || trimmedHostName || room.hostName,
        }

      setRecentRooms(upsertRoomHistory(nextEntry))
      setStoredPlayerName(nextEntry.playerName)
      onResumeRoom(nextEntry)
    } catch (err) {
      setResumeErrorByRoom((prev) => ({
        ...prev,
        [entry.roomId]: `继续失败：${String(err)}。你可以忽略这条记录，或直接移除。`,
      }))
    } finally {
      setResumingRoomId(null)
    }
  }

  if (loading) {
    return (
      <div className="game-lobby game-lobby--status">
        <p className="game-lobby__status">正在加载可创建的剧本模板，请稍候...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="game-lobby game-lobby--status">
        <p className="game-lobby__error">加载失败：{loadError}</p>
      </div>
    )
  }

  return (
    <section className="game-lobby">
      <header className="game-lobby__hero">
        <div className="game-lobby__hero-main">
          <p className="game-lobby__eyebrow">像聊天首页一样，新开一局或继续之前的房间</p>
          <h2 className="game-lobby__title">先起个昵称，再选模板或亲手搭一个故事宇宙</h2>
          <p className="game-lobby__subtitle">
            固定模板适合快速开玩；编辑模式适合你们自己定义背景、角色与 NPC，再直接进入选角。
          </p>
          <div className="game-lobby__steps" aria-label="创建步骤">
            <span className="game-lobby__step">1 填昵称</span>
            <span className="game-lobby__step">2 选模式</span>
            <span className="game-lobby__step">3 创建房间</span>
          </div>
        </div>

        <div className="game-lobby__preview" aria-hidden="true">
          <div className="game-lobby__preview-header">
            <span>{mode === 'template' ? '模板开房' : '编辑模式'}</span>
            <span>•••</span>
          </div>
          <div className="game-lobby__preview-body">
            <div className="game-lobby__preview-bubble game-lobby__preview-bubble--system">
              {mode === 'template' ? '先选一个剧本模板，再邀请大家加入。' : '把你想玩的世界观和人物关系先写下来。'}
            </div>
            <div className="game-lobby__preview-bubble game-lobby__preview-bubble--self">{trimmedHostName || '你的昵称'}</div>
            <div className="game-lobby__preview-card">
              <strong>{previewTitle}</strong>
              <span>{previewMeta}</span>
            </div>
          </div>
        </div>
      </header>

      <section className="game-lobby__panel game-lobby__panel--profile">
        <div className="game-lobby__avatar" aria-hidden="true">
          {avatarText}
        </div>
        <div className="game-lobby__profile-body">
          <label className="game-lobby__field">
            <span className="game-lobby__label">大家怎么称呼你？</span>
            <input
              className="game-lobby__input"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="例如：阿青 / 晚风 / 小林"
            />
          </label>
          <p className="game-lobby__helper">创建后你会先进入选角页，其他玩家稍后可通过房间加入。</p>
        </div>
      </section>

      <section className="game-lobby__panel game-lobby__panel--history">
        <div className="game-lobby__section-header">
          <div>
            <h3 className="game-lobby__section-title">继续之前玩过的房间</h3>
            <p className="game-lobby__section-caption">浏览器会记住你最近玩过的房间，下次回来可以直接接着玩。</p>
          </div>
          <span className="game-lobby__section-meta">{recentRooms.length} 条最近记录</span>
        </div>

        {recentRooms.length > 0 ? (
          <div className="game-lobby__list">
            {recentRooms.map((room) => {
              const resumeError = resumeErrorByRoom[room.roomId]
              const isResuming = resumingRoomId === room.roomId
              const templateLabel =
                room.templateDisplayName ??
                getCustomRoomGame(room.roomId)?.displayName ??
                templateDisplayNames.get(room.templateName) ??
                room.templateName

              return (
                <article
                  key={room.roomId}
                  className={`game-lobby__history-card ${resumeError ? 'game-lobby__history-card--invalid' : ''}`}
                >
                  <div className="game-lobby__history-header">
                    <div className="game-lobby__history-heading">
                      <strong className="game-lobby__history-title">{templateLabel}</strong>
                      <span className="game-lobby__history-subtitle">
                        房间 {shortenRoomId(room.roomId)} · 玩家 {room.playerName}
                      </span>
                    </div>
                    <span className={`game-lobby__card-tag ${room.characterId ? 'game-lobby__card-tag--selected' : ''}`}>
                      {room.characterId ? '可直接继续' : '继续选角'}
                    </span>
                  </div>

                  <div className="game-lobby__card-meta">
                    <span className="game-lobby__meta-pill">
                      {room.npcBackend === 'llm' ? 'LLM 直连' : 'Agent Runtime'}
                    </span>
                    <span className="game-lobby__meta-pill">最近：{formatRelativeTime(room.lastPlayedAt)}</span>
                    <span className="game-lobby__meta-pill">
                      {room.characterId ? `上次角色：${room.characterId}` : '上次停在选角前'}
                    </span>
                  </div>

                  {resumeError && <p className="game-lobby__history-error">{resumeError}</p>}

                  <div className="game-lobby__history-actions">
                    <button
                      type="button"
                      className="game-lobby__history-button game-lobby__history-button--primary"
                      onClick={() => handleResume(room)}
                      disabled={isResuming}
                    >
                      {isResuming ? '正在检查房间...' : room.characterId ? '继续房间' : '回到选角'}
                    </button>
                    <button
                      type="button"
                      className="game-lobby__history-button game-lobby__history-button--ghost"
                      onClick={() => handleRemoveRecentRoom(room.roomId)}
                    >
                      移除记录
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="game-lobby__empty">
            <p className="game-lobby__empty-title">还没有最近房间</p>
            <p className="game-lobby__empty-text">先创建一局或进入一次房间，之后这里会帮你记住进度。</p>
          </div>
        )}
      </section>

      <section className="game-lobby__panel game-lobby__panel--mode">
        <div className="game-lobby__section-header">
          <div>
            <h3 className="game-lobby__section-title">选择本次创建方式</h3>
            <p className="game-lobby__section-caption">想快一点就选模板；想完全自己定义，就切换到编辑模式。</p>
          </div>
          <span className="game-lobby__section-meta">{mode === 'template' ? '固定模板' : '自定义故事'}</span>
        </div>

        <div className="game-lobby__mode-switch" role="tablist" aria-label="房间创建模式">
          <button
            type="button"
            className={`game-lobby__mode-button ${mode === 'template' ? 'game-lobby__mode-button--active' : ''}`}
            onClick={() => setMode('template')}
            aria-pressed={mode === 'template'}
          >
            用内置模板
          </button>
          <button
            type="button"
            className={`game-lobby__mode-button ${mode === 'custom' ? 'game-lobby__mode-button--active' : ''}`}
            onClick={() => setMode('custom')}
            aria-pressed={mode === 'custom'}
          >
            进入编辑模式
          </button>
        </div>
      </section>

      <section className="game-lobby__panel game-lobby__panel--backend">
        <div className="game-lobby__section-header">
          <div>
            <h3 className="game-lobby__section-title">NPC 响应路径</h3>
            <p className="game-lobby__section-caption">开房时选定，用来对比 Agent Runtime 和直连 LLM 的实际反应时间。</p>
          </div>
          <span className="game-lobby__section-meta">{npcBackend === 'llm' ? 'LLM 直连' : 'Agent Runtime'}</span>
        </div>

        <div className="game-lobby__mode-switch" role="tablist" aria-label="NPC 响应路径">
          <button
            type="button"
            className={`game-lobby__mode-button ${npcBackend === 'agent-runtime' ? 'game-lobby__mode-button--active' : ''}`}
            onClick={() => setNpcBackend('agent-runtime')}
            aria-pressed={npcBackend === 'agent-runtime'}
          >
            Agent Runtime
          </button>
          <button
            type="button"
            className={`game-lobby__mode-button ${npcBackend === 'llm' ? 'game-lobby__mode-button--active' : ''}`}
            onClick={() => setNpcBackend('llm')}
            aria-pressed={npcBackend === 'llm'}
          >
            直连 LLM
          </button>
        </div>
        <p className="game-lobby__helper game-lobby__helper--compact">
          {npcBackend === 'llm'
            ? '会直接走 OpenAI-compatible LLM 接口，默认模型是 doubao-seed-1-6-flash-250828。'
            : '会走当前的 agent runtime / sync 链路，适合和直连 LLM 做响应时间对比。'}
        </p>
      </section>

      {mode === 'template' ? (
        <section className="game-lobby__panel game-lobby__panel--workspace">
          <div className="game-lobby__section-header">
            <div>
              <h3 className="game-lobby__section-title">选一个开场剧本</h3>
              <p className="game-lobby__section-caption">推荐先从固定角色模板开始，流程更清晰。</p>
            </div>
            <span className="game-lobby__section-meta">{fixedGames.length} 个可用模板</span>
          </div>

          {fixedGames.length > 0 ? (
            <div className="game-lobby__list">
              {fixedGames.map((game) => {
                const playableCount = game.characters.filter((character) => !character.isNpc).length
                const npcCount = game.characters.filter((character) => character.isNpc).length
                const isSelected = selectedGame === game.name

                return (
                  <button
                    key={game.name}
                    type="button"
                    className={`game-lobby__card ${isSelected ? 'game-lobby__card--selected' : ''}`}
                    onClick={() => setSelectedGame(game.name)}
                    aria-pressed={isSelected}
                  >
                    <div className="game-lobby__card-header">
                      <div className="game-lobby__card-heading">
                        <strong className="game-lobby__card-title">{game.displayName}</strong>
                        <span className="game-lobby__card-hint">
                          {isSelected ? '已设为本次开场剧本' : '点击即可作为本次开场剧本'}
                        </span>
                      </div>
                      <span className={`game-lobby__card-tag ${isSelected ? 'game-lobby__card-tag--selected' : ''}`}>
                        {isSelected ? '已选择' : '选择'}
                      </span>
                    </div>
                    <p className="game-lobby__card-description">{game.description}</p>
                    <div className="game-lobby__card-meta">
                      <span className="game-lobby__meta-pill">{playableCount} 个可扮演角色</span>
                      <span className="game-lobby__meta-pill">{npcCount} 个 NPC</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="game-lobby__empty">
              <p className="game-lobby__empty-title">暂时没有可创建的固定角色模板</p>
              <p className="game-lobby__empty-text">请稍后刷新页面，或联系管理员检查模板配置。</p>
            </div>
          )}
        </section>
      ) : (
        <section className="game-lobby__panel game-lobby__panel--workspace">
          <div className="game-lobby__section-header">
            <div>
              <h3 className="game-lobby__section-title">编辑你的故事房间</h3>
              <p className="game-lobby__section-caption">最低配置：标题、简介、背景、至少 1 个玩家角色、至少 1 个 NPC。</p>
            </div>
            <span className="game-lobby__section-meta">自由创建</span>
          </div>

          <div className="game-lobby__editor">
            <div className="game-lobby__editor-grid">
              <label className="game-lobby__field">
                <span className="game-lobby__label">故事标题</span>
                <input
                  className="game-lobby__input"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="例如：雨夜列车的最后一站"
                />
              </label>

              <label className="game-lobby__field">
                <span className="game-lobby__label">一句话简介</span>
                <input
                  className="game-lobby__input"
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder="用一句话概括这局故事的氛围与冲突"
                />
              </label>
            </div>

            <label className="game-lobby__field">
              <span className="game-lobby__label">背景 / 世界观</span>
              <textarea
                className="game-lobby__textarea game-lobby__textarea--world"
                value={customWorld}
                onChange={(e) => setCustomWorld(e.target.value)}
                placeholder="可以写时代背景、当前局势、玩家需要知道的线索，也支持分段输入。"
              />
            </label>

            <section className="game-lobby__editor-group">
              <div className="game-lobby__editor-group-header">
                <div>
                  <h4 className="game-lobby__editor-group-title">可扮演角色</h4>
                  <p className="game-lobby__editor-group-caption">这些角色会出现在选角页，由玩家点击进入。</p>
                </div>
                <button
                  type="button"
                  className="game-lobby__inline-button"
                  onClick={() => appendCharacterDraft('playable')}
                >
                  + 添加角色
                </button>
              </div>

              <div className="game-lobby__editor-cards">
                {playableCharacters.map((character, index) => (
                  <article key={character.key} className="game-lobby__editor-card">
                    <div className="game-lobby__editor-card-header">
                      <strong className="game-lobby__editor-card-title">角色 {index + 1}</strong>
                      <button
                        type="button"
                        className="game-lobby__text-button"
                        onClick={() => removeCharacterDraft('playable', character.key)}
                        disabled={playableCharacters.length === 1}
                      >
                        删除
                      </button>
                    </div>

                    <div className="game-lobby__editor-grid">
                      <label className="game-lobby__field">
                        <span className="game-lobby__label">角色名</span>
                        <input
                          className="game-lobby__input"
                          value={character.name}
                          onChange={(e) => updateCharacterDraft('playable', character.key, 'name', e.target.value)}
                          placeholder="例如：安禾"
                        />
                      </label>

                      <label className="game-lobby__field">
                        <span className="game-lobby__label">性格关键词</span>
                        <input
                          className="game-lobby__input"
                          value={character.personality}
                          onChange={(e) =>
                            updateCharacterDraft('playable', character.key, 'personality', e.target.value)
                          }
                          placeholder="例如：冷静、嘴硬、行动派"
                        />
                      </label>
                    </div>

                    <label className="game-lobby__field">
                      <span className="game-lobby__label">角色简介</span>
                      <textarea
                        className="game-lobby__textarea"
                        value={character.description}
                        onChange={(e) => updateCharacterDraft('playable', character.key, 'description', e.target.value)}
                        placeholder="写清楚身份、与故事的关系，方便玩家选角。"
                      />
                    </label>
                  </article>
                ))}
              </div>
            </section>

            <section className="game-lobby__editor-group">
              <div className="game-lobby__editor-group-header">
                <div>
                  <h4 className="game-lobby__editor-group-title">NPC</h4>
                  <p className="game-lobby__editor-group-caption">这些角色不会被玩家选择，会在剧情里由 AI 承接互动。</p>
                </div>
                <button type="button" className="game-lobby__inline-button" onClick={() => appendCharacterDraft('npc')}>
                  + 添加 NPC
                </button>
              </div>

              <div className="game-lobby__editor-cards">
                {npcCharacters.map((character, index) => (
                  <article key={character.key} className="game-lobby__editor-card">
                    <div className="game-lobby__editor-card-header">
                      <strong className="game-lobby__editor-card-title">NPC {index + 1}</strong>
                      <button
                        type="button"
                        className="game-lobby__text-button"
                        onClick={() => removeCharacterDraft('npc', character.key)}
                        disabled={npcCharacters.length === 1}
                      >
                        删除
                      </button>
                    </div>

                    <div className="game-lobby__editor-grid">
                      <label className="game-lobby__field">
                        <span className="game-lobby__label">NPC 名称</span>
                        <input
                          className="game-lobby__input"
                          value={character.name}
                          onChange={(e) => updateCharacterDraft('npc', character.key, 'name', e.target.value)}
                          placeholder="例如：列车长 / 店老板 / 目击者"
                        />
                      </label>

                      <label className="game-lobby__field">
                        <span className="game-lobby__label">性格关键词</span>
                        <input
                          className="game-lobby__input"
                          value={character.personality}
                          onChange={(e) => updateCharacterDraft('npc', character.key, 'personality', e.target.value)}
                          placeholder="例如：神秘、圆滑、守口如瓶"
                        />
                      </label>
                    </div>

                    <label className="game-lobby__field">
                      <span className="game-lobby__label">NPC 简介</span>
                      <textarea
                        className="game-lobby__textarea"
                        value={character.description}
                        onChange={(e) => updateCharacterDraft('npc', character.key, 'description', e.target.value)}
                        placeholder="描述 ta 的身份、动机和与玩家的关系。"
                      />
                    </label>
                  </article>
                ))}
              </div>
            </section>

            <div className="game-lobby__editor-hints">
              <span className="game-lobby__meta-pill">已完成玩家角色：{customPlayableCount}</span>
              <span className="game-lobby__meta-pill">已完成 NPC：{customNpcCount}</span>
              <span className="game-lobby__meta-pill">背景字数：{trimmedCustomWorld.length}</span>
            </div>
          </div>
        </section>
      )}

      <section className="game-lobby__panel game-lobby__panel--action">
        <div className="game-lobby__selection">
          <span className="game-lobby__selection-label">准备开始</span>
          <div className="game-lobby__selection-grid">
            <div className="game-lobby__selection-item">
              <span className="game-lobby__selection-item-label">昵称</span>
              <strong className="game-lobby__selection-value">{trimmedHostName || '未填写'}</strong>
            </div>
            <div className="game-lobby__selection-item">
              <span className="game-lobby__selection-item-label">{mode === 'template' ? '剧本' : '编辑模式'}</span>
              <strong className="game-lobby__selection-value">
                {mode === 'template' ? (selectedTemplate?.displayName ?? '未选择') : (trimmedCustomTitle || '未填写标题')}
              </strong>
            </div>
            <div className="game-lobby__selection-item">
              <span className="game-lobby__selection-item-label">NPC 路径</span>
              <strong className="game-lobby__selection-value">
                {npcBackend === 'llm' ? 'LLM 直连' : 'Agent Runtime'}
              </strong>
            </div>
          </div>
          <p className="game-lobby__helper game-lobby__helper--compact">
            {!trimmedHostName
              ? '先填昵称，再继续。'
              : mode === 'template'
                ? !selectedTemplate
                  ? '再选一个剧本模板，就能创建房间。'
                  : '创建后立即进入选角界面。'
                : customErrors.length > 0
                  ? `还差：${customErrors[0]}`
                  : '你的故事已就绪，创建后会直接进入自定义选角页。'}
          </p>
          {mode === 'custom' && customErrors.length > 1 && (
            <ul className="game-lobby__validation-list">
              {customErrors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {actionError && <p className="game-lobby__inline-error">创建失败：{actionError}</p>}
        </div>

        <button type="button" className="game-lobby__create-button" onClick={handleCreate} disabled={!canCreate}>
          {creating ? '正在创建房间...' : mode === 'template' ? '创建聊天房间' : '创建自定义故事房间'}
        </button>
      </section>
    </section>
  )
}
