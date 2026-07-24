import { ipcMain } from 'electron'
import type {
  HiveAddCredentialArgs,
  HiveDeployEnvironmentArgs,
  HiveDispatchArgs,
  HiveGetEnvFilesArgs,
  HiveLatestBuildArgs,
  HiveListEnvironmentsArgs,
  HiveListProjectsArgs,
  HiveSaveEnvFilesArgs,
  HiveStreamHistoryArgs,
  HiveTriggerBuildArgs,
  HiveTriggerDeployArgs,
  HiveUpdateCredentialArgs
} from '../../shared/hive-types'
import {
  hiveDeployEnvironment,
  hiveDispatch,
  hiveGetEnvFiles,
  hiveLatestBuild,
  hiveListEnvironments,
  hiveListProjects,
  hiveProbeCredential,
  hiveSaveEnvFiles,
  hiveStreamHistory,
  hiveTriggerBuild,
  hiveTriggerDeploy
} from '../hive/client'
import {
  addHiveCredential,
  listHiveCredentials,
  removeHiveCredential,
  updateHiveCredential
} from '../hive/credential-store'

export function registerHiveHandlers(): void {
  ipcMain.handle('hive:listCredentials', () => listHiveCredentials())

  ipcMain.handle('hive:addCredential', (_event, args: HiveAddCredentialArgs) => {
    const created = addHiveCredential(args)
    // Best-effort probe; ignore failures so add still succeeds offline.
    void hiveProbeCredential(created.id)
    return created
  })

  ipcMain.handle('hive:updateCredential', (_event, args: HiveUpdateCredentialArgs) =>
    updateHiveCredential(args)
  )

  ipcMain.handle('hive:removeCredential', (_event, id: string) => {
    removeHiveCredential(id)
  })

  ipcMain.handle('hive:probeCredential', async (_event, credentialId: string) =>
    hiveProbeCredential(credentialId)
  )

  ipcMain.handle('hive:listProjects', async (_event, args: HiveListProjectsArgs) =>
    hiveListProjects(args.credentialId)
  )

  ipcMain.handle('hive:listEnvironments', async (_event, args: HiveListEnvironmentsArgs) =>
    hiveListEnvironments(args.credentialId, args.projectId)
  )

  ipcMain.handle('hive:latestBuild', async (_event, args: HiveLatestBuildArgs) =>
    hiveLatestBuild(args.credentialId, args.projectId)
  )

  ipcMain.handle('hive:triggerBuild', async (_event, args: HiveTriggerBuildArgs) =>
    hiveTriggerBuild(args.credentialId, args.projectId)
  )

  ipcMain.handle('hive:triggerDeploy', async (_event, args: HiveTriggerDeployArgs) =>
    hiveTriggerDeploy(args.credentialId, args.projectId, args.env ?? 'dev')
  )

  ipcMain.handle('hive:dispatch', async (_event, args: HiveDispatchArgs) =>
    hiveDispatch(args.credentialId, args.projectId, {
      tipe: args.tipe,
      branch: args.branch,
      commit: args.commit,
      workflow: args.workflow
    })
  )

  ipcMain.handle('hive:getEnvFiles', async (_event, args: HiveGetEnvFilesArgs) =>
    hiveGetEnvFiles(args.credentialId, args.projectId, args.envId)
  )

  ipcMain.handle('hive:saveEnvFiles', async (_event, args: HiveSaveEnvFilesArgs) =>
    hiveSaveEnvFiles(args.credentialId, args.projectId, args.envId, args.files)
  )

  ipcMain.handle('hive:streamHistory', async (_event, args: HiveStreamHistoryArgs) =>
    hiveStreamHistory(args.credentialId, args.projectId, {
      env: args.env,
      limit: args.limit
    })
  )

  ipcMain.handle('hive:deployEnvironment', async (_event, args: HiveDeployEnvironmentArgs) =>
    hiveDeployEnvironment(args.credentialId, args.projectId, args.envId, args.async !== false)
  )
}
