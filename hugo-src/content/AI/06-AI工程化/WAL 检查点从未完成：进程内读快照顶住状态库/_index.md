---
title: "WAL 检查点从未完成：进程内读快照顶住状态库"
date: "2026-11-14 12:00:00 +0800"
weight: 9
tags: ['AI', 'SQLite', '可靠性']
menu:
  main:
    parent: "06-AI工程化"
---

一台 Windows 10 机器上，网关的状态库 `state/openclaw.sqlite` 已经长到约 405 MB，旁边的 `-wal` 文件在 47 到 73 MB 之间浮动。网关每次启动后不久，WAL 自动检查点就开始报阻塞，一直到关机都没成功过一次。

报告者贴出的状态是这四行：

```
openclaw-state WAL checkpoint PASSIVE blocked by a reader
  state=blocked  checkpointedFrames=866  logFrames=17091
  consecutiveBlocked=14  lastCompletedAtMs=null  never_completed=true
```

`checkpointedFrames` 866 对 `logFrames` 17091，意味着已写入的帧里有九成以上没有回填到主库。`lastCompletedAtMs` 是 null，`never_completed` 是 true——从开机到现在，一次都没完成。

![openclaw/openclaw issue #164294 页面截图](/skill-article/A-wal-checkpoint/src_issue.png)
*来源：GitHub openclaw/openclaw issue #164294 页面，github.com，截取日期 2026-11-14*

## 先排除了外部竞争者

WAL 检查点推进不下去，最直觉的解释是别的进程还开着读事务，把快照钉住了。报告者用 Sysinternals 的 handle.exe 扫了全机器：

```
node.exe  pid: 33900  .sqlite  x7
node.exe  pid: 33900  -wal     x7
node.exe  pid: 33900  -shm     x1
```

所有句柄都属于网关自己的那个进程，pid 33900，一个不落。没有第二个程序碰过这个库。这不是多进程抢锁，锁在进程内部。

（这里说的是句柄层面。SQLite 的读快照由连接持有，不体现为额外的文件句柄，所以 handle.exe 能排除外部进程，却指不出内部是哪条连接。）

## 遥测自己说不清是谁

网关的运行时遥测能看到候选连接，但给的答案自相矛盾：

```json
"candidate_connection": {
  "connectionId": 2, "operation": "sqlite connection", "ownerKind": "worker",
  "threadId": 2, "ageMs": ~25200000, "transactionOpen": false,
  "trackedReaders": 0, "blockingOwner": "unknown",
  "readerCount": 0, "scope": "current-thread", "nativeStatements": "unobserved"
}
```

`blockingOwner` 是 unknown，`readerCount` 是 0，`trackedReaders` 也是 0，可检查点给出的理由是「blocked by a reader」。

一个线程存活了约 25200 秒（七小时），事务没开着，读计数为零，系统仍然认为有人挡着。这组字段放在一起，说明读快照的追踪路径没有覆盖所有连接类型——`scope: current-thread` 加上 `nativeStatements: unobserved`，等于承认它只对当前线程、只对能观测到的语句负责。

对使用者的意义很直接：当遥测说「blocked by a reader」却又说 readerCount 是 0，不要把这句话当成结论，它只是把未知换了个说法。

## 复现是稳定的，清除只有一条路

报告者记录了完整的时间线：

1. 维护流程先停网关，检查点干净完成，两条库都返回 `(0,0,0)`，时间是 12:00:01。
2. 重启后大约 12:03，阻塞立刻成形，之后再不消失。12:03 到 19:05 之间记下 71 条阻塞记录，`never_completed=true`。
3. 只有再重启一次网关才能清掉。

也就是说，每一次 uptime 周期里都会重演：启动干净、三分钟内被钉住、整个生命周期不再推进。这不是偶发抖动，是重启即复现的结构性行为。

## 与之相关但尚未证实的后果

同一份报告里还列了两条现象：`Agent run failed: the Gateway state database was busy (SQLite: database is locked)`，以及反复出现的 `cron: isolated agent setup timed out before runner start`。

同一个库、同一个子系统、时间上对得上。但报告者自己写明没有做对照复现，所以因果未证（causation is unproven）。这层边界要留着：WAL 不推进会让库变大、让写事务更容易撞锁，这是机制上的合理推断，但把它当成已确诊的病因就过头了。

## 可迁移的观察点

这个案例本身是一个具体产品的问题，其中三条对任何自建 SQLite 状态库的服务都成立。

**检查点要单独监控，不能只看库大小。** `never_completed=true` 这种字段平时没人盯，等到磁盘告警时已经积累了几十 MB 的 WAL。把「上次检查点完成时间」当成一等指标，比监控文件大小更早暴露问题。

**WAL 大小是趋势信号。** 报告里从 41.5 MB 涨到 65.7 MB，四小时涨了 24 MB。这个斜率比绝对值有用，它告诉你回填速度跟不上写入速度。

**遥测字段互相矛盾时，先修观测能力。** 「blocked by a reader」配上 readerCount 0，会让排障的人去找一个不存在的读者。报告者给的方向是长期存活连接或未重置的语句钉住了快照（threadId=2、ownerKind=worker），这仍是推测，但推测的方向是对的：先让读快照的追踪覆盖所有连接类型，才谈得上定位。

报告环境是单用户自托管、Windows、OpenClaw 2026.9.7。issue 目前挂着 stale 与 P2 标签，创建于 2026-10-03，最后更新是 2026-11-06。不同平台、不同规模的部署能不能复现，这份材料无法回答。

## 参考来源

- openclaw/openclaw issue #164294：Gateway state DB WAL auto-checkpoint never completes (pinned by in-process reader)，https://github.com/openclaw/openclaw/issues/164294 （采集日期 2026-11-14）
