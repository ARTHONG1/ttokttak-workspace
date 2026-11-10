/** 생기부 나이스 입력: 세특 and 행발 typed into the NEIS grid (names in core/registry.ts) */
import type { Feature } from '../../core/feature'
import { featureInfo } from '../../core/registry'
import { openRecord } from './panel'

export const neisRecord: Feature = { ...featureInfo('neis-record')!, open: openRecord }
