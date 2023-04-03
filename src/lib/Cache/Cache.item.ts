import { merge } from "lodash"
import { makeAutoObservable } from "mobx"

import { timeDeltaInMinutes, uuid } from "../util"

export class CacheItem<TItem extends IAnyObject> {
  // ====================================================
  // Model
  // ====================================================
  id: string
  cachedAt: Date

  // ====================================================
  // Constructor
  // ====================================================
  constructor(public data: TItem, public ttl: number) {
    makeAutoObservable(this)

    this.id = (this.data.id || uuid()).toString()
    this.cachedAt = new Date()
  }

  // ====================================================
  // Computed
  // ====================================================
  isStale = (now: Date): boolean => {
    return timeDeltaInMinutes(now, this.cachedAt) > this.ttl
  }

  // ====================================================
  // Actions
  // ====================================================
  update = (data: TItem, opts = { merge: true }) => {
    if (opts?.merge) {
      this.data = merge(this.data, data)
    } else {
      this.data = data
    }
  }
}
