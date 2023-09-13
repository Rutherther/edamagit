import { window } from 'vscode';
import { MagitRepository } from '../models/magitRepository';
import { MenuUtil, MenuState, Switch, MenuItem } from '../menu/menu';
import { gitRun } from '../utils/gitRawRunner';
import { PickMenuItem, PickMenuUtil } from '../menu/pickMenu';
import { RefType } from '../typings/git';
import GitUtils from '../utils/gitUtils';
import GitTextUtils from '../utils/gitTextUtils';

export async function fetching(repository: MagitRepository): Promise<any> {

  const fetchingMenuItems: MenuItem[] = [];

  if (repository.HEAD?.pushRemote) {
    const pushRemote = repository.HEAD?.pushRemote;
    fetchingMenuItems.push({ label: 'p', description: `${pushRemote.remote}/${pushRemote.name}`, action: fetchFromPushRemote });
  } else {
    fetchingMenuItems.push({ label: 'p', description: `pushRemote, after setting that`, action: fetchSetPushRemote });
  }

  if (repository.HEAD?.upstream) {
    const upstream = repository.HEAD?.upstream;
    fetchingMenuItems.push({ label: 'u', description: `${upstream.remote}/${upstream.name}`, action: fetchFromUpstream });
  } else {
    fetchingMenuItems.push({ label: 'u', description: `@{upstream}, after setting that`, action: fetchSetUpstream });
  }

  fetchingMenuItems.push({ label: 'e', description: 'elsewhere', action: fetchFromElsewhere });

  fetchingMenuItems.push({ label: 'a', description: 'all remotes', action: fetchAll });

  fetchingMenuItems.push({ label: 'o', description: 'another branch', action: fetchAnotherBranch });

  if (repository.submodules.length) {
    fetchingMenuItems.push({ label: 's', description: 'submodules', action: fetchSubmodules });
  }

  const switches: Switch[] = [
    { key: '-p', name: '--prune', description: 'Prune deleted branches' }
  ];

  return MenuUtil.showMenu({ title: 'Fetching', commands: fetchingMenuItems }, { repository, switches });
}

async function fetchSetUpstream({ repository, ...rest }: MenuState) {

  let choices = [...repository.refs];

  if (repository.remotes.length > 0 &&
    !choices.find(ref => ref.name === repository.remotes[0].name + '/' + repository.HEAD?.name)) {
    choices = [{
      name: `${repository.remotes[0].name}/${repository.HEAD?.name}`,
      remote: repository.remotes[0].name,
      type: RefType.RemoteHead
    }, ...choices];
  }

  const refs: PickMenuItem<string>[] = choices
    .filter(ref => ref.type !== RefType.Tag && ref.name !== repository.HEAD?.name)
    .sort((refA, refB) => refB.type - refA.type)
    .map(r => ({ label: r.name!, description: GitTextUtils.shortHash(r.commit), meta: r.name! }));

  let chosenRemote;
  try {
    chosenRemote = await PickMenuUtil.showMenu(refs);
  } catch { }

  const ref = repository.HEAD?.name;

  if (chosenRemote && ref) {

    const [remote, name] = GitTextUtils.remoteBranchFullNameToSegments(chosenRemote);

    if (remote && name) {

      await GitUtils.setConfigVariable(repository, `branch.${ref}.merge`, `refs/heads/${name}`);
      await GitUtils.setConfigVariable(repository, `branch.${ref}.remote`, remote);

      repository.HEAD!.upstreamRemote = { name, remote };

      return fetchFromUpstream({ repository, ...rest });
    }
  }
}

async function fetchSetPushRemote({ repository, ...rest }: MenuState) {
  const remotes: PickMenuItem<string>[] = repository.remotes
    .map(r => ({ label: r.name, description: r.pushUrl, meta: r.name }));

  const chosenRemote = await PickMenuUtil.showMenu(remotes);

  const ref = repository.HEAD?.name;

  if (chosenRemote && ref) {
    await GitUtils.setConfigVariable(repository, `branch.${ref}.pushRemote`, chosenRemote);

    repository.HEAD!.pushRemote = { name: ref, remote: chosenRemote };
    return fetchFromPushRemote({ repository, ...rest });
  }
}

async function fetchFromPushRemote({ repository, switches }: MenuState) {
  if (repository.HEAD?.pushRemote) {
    const args = ['fetch', ...MenuUtil.switchesToArgs(switches), repository.HEAD.pushRemote.remote];
    return gitRun(repository.gitRepository, args);
  }
}

async function fetchFromUpstream({ repository, switches }: MenuState) {

  if (repository.HEAD?.upstreamRemote) {
    const args = ['fetch', ...MenuUtil.switchesToArgs(switches), repository.HEAD.upstreamRemote.remote];
    return gitRun(repository.gitRepository, args);
  }
}

async function fetchFromElsewhere({ repository, switches }: MenuState) {

  const remotes: PickMenuItem<string>[] = repository.remotes
    .map(r => ({ label: r.name, description: r.pushUrl, meta: r.name }));

  const chosenRemote = await PickMenuUtil.showMenu(remotes);

  if (chosenRemote) {
    const args = ['fetch', ...MenuUtil.switchesToArgs(switches), chosenRemote];
    return gitRun(repository.gitRepository, args);
  }
}

async function fetchAll({ repository, switches }: MenuState) {
  const args = ['fetch', ...MenuUtil.switchesToArgs(switches), '--all'];
  return gitRun(repository.gitRepository, args);
}

async function fetchAnotherBranch({ repository, switches }: MenuState) {
  const remote = await window.showInputBox({ prompt: 'Fetch from remote or url' });
  if (remote) {
    const branch = await window.showInputBox({ prompt: 'Fetch branch' });
    if (branch) {
      const args = ['fetch', ...MenuUtil.switchesToArgs(switches), remote, `refs/heads/${branch}`];
      return gitRun(repository.gitRepository, args);
    }
  }
}

export async function fetchSubmodules({ repository, switches }: MenuState) {

  const args = ['fetch', '--verbose', '--recurse-submodules', ...MenuUtil.switchesToArgs(switches)];
  return gitRun(repository.gitRepository, args);
}