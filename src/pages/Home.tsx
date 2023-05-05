import { createEffect, onMount, Show, Switch, Match, type Component } from 'solid-js';

import { useNavigate } from '@solidjs/router';
import { createVirtualizer } from '@tanstack/solid-virtual';
import uniq from 'lodash/uniq';

import Column from '@/components/Column';
import ProfileDisplay from '@/components/modal/ProfileDisplay';
import ProfileEdit from '@/components/modal/ProfileEdit';
import Notification from '@/components/Notification';
import SideBar from '@/components/SideBar';
import Timeline from '@/components/Timeline';
import useConfig from '@/core/useConfig';
import useModalState from '@/hooks/useModalState';
import usePersistStatus from '@/hooks/usePersistStatus';
import { useMountShortcutKeys } from '@/hooks/useShortcutKeys';
import useFollowings from '@/nostr/useFollowings';
import usePool from '@/nostr/usePool';
import usePubkey from '@/nostr/usePubkey';
import useSubscription from '@/nostr/useSubscription';
import ensureNonNull from '@/utils/ensureNonNull';
import epoch from '@/utils/epoch';

const Home: Component = () => {
  useMountShortcutKeys();
  const navigate = useNavigate();
  const { persistStatus } = usePersistStatus();
  const { modalState, showProfile, closeModal } = useModalState();

  const pool = usePool();
  const { config } = useConfig();
  const pubkey = usePubkey();

  createEffect(() => {
    config().relayUrls.map(async (relayUrl) => {
      const relay = await pool().ensureRelay(relayUrl);
      relay.on('notice', (msg: string) => {
        console.error(`NOTICE: ${relayUrl}: ${msg}`);
      });
    });
  });

  const { followingPubkeys } = useFollowings(() =>
    ensureNonNull([pubkey()] as const)(([pubkeyNonNull]) => ({
      relayUrls: config().relayUrls,
      pubkey: pubkeyNonNull,
    })),
  );

  const { events: followingsPosts } = useSubscription(() => {
    const authors = uniq([...followingPubkeys()]);
    if (authors.length === 0) return null;
    return {
      relayUrls: config().relayUrls,
      filters: [
        {
          kinds: [1, 6],
          authors,
          limit: 10,
          since: epoch() - 4 * 60 * 60,
        },
      ],
    };
  });

  const { events: myPosts } = useSubscription(() =>
    ensureNonNull([pubkey()] as const)(([pubkeyNonNull]) => ({
      relayUrls: config().relayUrls,
      filters: [
        {
          kinds: [1, 6],
          authors: [pubkeyNonNull],
          limit: 10,
        },
      ],
    })),
  );

  const { events: myReactions } = useSubscription(() =>
    ensureNonNull([pubkey()] as const)(([pubkeyNonNull]) => ({
      relayUrls: config().relayUrls,
      filters: [
        {
          kinds: [7],
          authors: [pubkeyNonNull],
          limit: 10,
        },
      ],
    })),
  );

  const { events: notifications } = useSubscription(() =>
    ensureNonNull([pubkey()] as const)(([pubkeyNonNull]) => ({
      relayUrls: config().relayUrls,
      filters: [
        {
          kinds: [1, 6, 7],
          '#p': [pubkeyNonNull],
          limit: 10,
        },
      ],
    })),
  );

  const { events: localTimeline } = useSubscription(() => ({
    relayUrls: [
      'wss://relay-jp.nostr.wirednet.jp',
      'wss://nostr.h3z.jp',
      'wss://nostr.holybea.com',
    ],
    filters: [
      {
        kinds: [1, 6],
        limit: 25,
        since: epoch() - 4 * 60 * 60,
      },
    ],
    clientEventFilter: (ev) => {
      return /[\p{scx=Hiragana}\p{scx=Katakana}\p{sc=Han}]/u.test(ev.content);
    },
  }));

  onMount(() => {
    if (!persistStatus().loggedIn) {
      navigate('/hello');
    }
  });

  return (
    <div class="absolute inset-0 flex w-screen touch-manipulation flex-row overflow-hidden">
      <SideBar />
      <div class="flex h-full snap-x snap-mandatory flex-row overflow-y-hidden overflow-x-scroll">
        <Column name="ホーム" columnIndex={1} width="widest">
          <Timeline events={followingsPosts()} />
        </Column>
        <Column name="通知" columnIndex={2} width="medium">
          <Notification events={notifications()} />
        </Column>
        <Column name="日本リレー" columnIndex={3} width="medium">
          <Timeline events={localTimeline()} />
        </Column>
        <Column name="自分の投稿" columnIndex={4} width="medium">
          <Timeline events={myPosts()} />
        </Column>
        <Column name="自分のいいね" columnIndex={5} lastColumn width="medium">
          <Notification events={myReactions()} />
        </Column>
      </div>
      <Show when={modalState()} keyed>
        {(state) => (
          <Switch>
            <Match when={state.type === 'Profile' && state.pubkey} keyed>
              {(pubkeyNonNull: string) => (
                <ProfileDisplay pubkey={pubkeyNonNull} onClose={closeModal} />
              )}
            </Match>
            <Match when={state.type === 'ProfileEdit'} keyed>
              <ProfileEdit
                onClose={() =>
                  ensureNonNull([pubkey()])(([pubkeyNonNull]) => {
                    showProfile(pubkeyNonNull);
                  })
                }
              />
            </Match>
          </Switch>
        )}
      </Show>
    </div>
  );
};

export default Home;
