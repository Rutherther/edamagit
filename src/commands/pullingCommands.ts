import { MenuItem, MenuState, MenuUtil } from '../menu/menu';
import { PickMenuItem, PickMenuUtil } from '../menu/pickMenu';
import { MagitRepository } from '../models/magitRepository';
import { gitRun } from '../utils/gitRawRunner';
import { RefType } from '../typings/git';
import GitUtils from '../utils/gitUtils';
import GitTextUtils from '../utils/gitTextUtils';

function generatePullingMenu(repository: MagitRepository) {
  const pullingMenuItems: MenuItem[] = [];


  if (repository.HEAD?.pushRemote) {
    const pushRemote = repository.HEAD?.pushRemote;
    pullingMenuItems.push({ label: 'p', description: `${pushRemote.remote}/${pushRemote.name}`, action: pullFromPushRemote });
  } else {
    pullingMenuItems.push({ label: 'p', description: `pushRemote, after setting that`, action: pullSetPushRemote });
  }

  if (repository.HEAD?.upstream) {
    const upstream = repository.HEAD?.upstream;
    pullingMenuItems.push({ label: 'u', description: `${upstream.remote}/${upstream.name}`, action: pullFromUpstream });
  } else {
    pullingMenuItems.push({ label: 'u', description: `@{upstream}, after setting that`, action: pullSetUpstream });
  }

  pullingMenuItems.push({ label: 'e', description: 'elsewhere', action: pullFromElsewhere });
  return { title: 'Pulling', commands: pullingMenuItems };
}

export async function pulling(repository: MagitRepository): Promise<any> {
  const switches = [
    { key: '-r', name: '--rebase', description: 'Rebase local commits' }
  ];

  return MenuUtil.showMenu(generatePullingMenu(repository), { repository, switches });
}

async function pullSetUpstream({ repository, ...rest }: MenuState) {

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

      return pullFromUpstream({ repository, ...rest });
    }
  }
}
async function pullSetPushRemote({ repository, ...rest }: MenuState) {
  const remotes: PickMenuItem<string>[] = repository.remotes
    .map(r => ({ label: r.name, description: r.pushUrl, meta: r.name }));

  const chosenRemote = await PickMenuUtil.showMenu(remotes);

  const ref = repository.HEAD?.name;

  if (chosenRemote && ref) {
    await GitUtils.setConfigVariable(repository, `branch.${ref}.pushRemote`, chosenRemote);

    repository.HEAD!.pushRemote = { name: ref, remote: chosenRemote };
    return pullFromPushRemote({ repository, ...rest });
  }
}


async function pullFromPushRemote({ repository, switches }: MenuState) {
  const pushRemote = repository.HEAD?.pushRemote;
  if (pushRemote) {
    const args = ['pull', ...MenuUtil.switchesToArgs(switches), pushRemote.remote, pushRemote.name];
    return gitRun(repository.gitRepository, args);
  }
}

function pullFromUpstream({ repository, switches }: MenuState) {
  const args = ['pull', ...MenuUtil.switchesToArgs(switches)];
  return gitRun(repository.gitRepository, args);
}

async function pullFromElsewhere({ repository, switches }: MenuState) {
  const elseWhere = repository.remotes
    .flatMap(r =>
      r.branches
        .map(b => b.name)
        .filter((n): n is string => !!n)
    )
    .map(r => ({ label: r, meta: r }));

  const chosenElse = await PickMenuUtil.showMenu(elseWhere, 'Pull');
  if (chosenElse) {
    const idx = chosenElse.indexOf('/');
    const remote = chosenElse.slice(0, idx);
    const branch = chosenElse.slice(idx + 1);
    const args = ['pull', ...MenuUtil.switchesToArgs(switches), remote, branch];
    return gitRun(repository.gitRepository, args);
  }
}