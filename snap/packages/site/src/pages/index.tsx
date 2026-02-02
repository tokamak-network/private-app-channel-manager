import styled from 'styled-components';

import {
  ConnectButton,
  InstallFlaskButton,
  ReconnectButton,
  Card,
} from '../components';
import { defaultSnapOrigin } from '../config';
import {
  useMetaMask,
  useInvokeSnap,
  useMetaMaskContext,
  useRequestSnap,
} from '../hooks';
import { isLocalSnap, shouldDisplayReconnectButton } from '../utils';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  margin-top: 7.6rem;
  margin-bottom: 7.6rem;
  ${({ theme }) => theme.mediaQueries.small} {
    padding-left: 2.4rem;
    padding-right: 2.4rem;
    margin-top: 2rem;
    margin-bottom: 2rem;
    width: auto;
  }
`;

const Heading = styled.h1`
  margin-top: 0;
  margin-bottom: 2.4rem;
  text-align: center;
`;

const Span = styled.span`
  color: ${(props) => props.theme.colors.primary?.default};
`;

const Subtitle = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.large};
  font-weight: 500;
  margin-top: 0;
  margin-bottom: 0;
  ${({ theme }) => theme.mediaQueries.small} {
    font-size: ${({ theme }) => theme.fontSizes.text};
  }
`;

const CardContainer = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  max-width: 64.8rem;
  width: 100%;
  height: 100%;
  margin-top: 1.5rem;
`;

const Notice = styled.div`
  background-color: ${({ theme }) => theme.colors.background?.alternative};
  border: 1px solid ${({ theme }) => theme.colors.border?.default};
  color: ${({ theme }) => theme.colors.text?.alternative};
  border-radius: ${({ theme }) => theme.radii.default};
  padding: 2.4rem;
  margin-top: 2.4rem;
  max-width: 60rem;
  width: 100%;

  & > * {
    margin: 0;
  }
  ${({ theme }) => theme.mediaQueries.small} {
    margin-top: 1.2rem;
    padding: 1.6rem;
  }
`;

const ErrorMessage = styled.div`
  background-color: ${({ theme }) => theme.colors.error?.muted};
  border: 1px solid ${({ theme }) => theme.colors.error?.default};
  color: ${({ theme }) => theme.colors.error?.alternative};
  border-radius: ${({ theme }) => theme.radii.default};
  padding: 2.4rem;
  margin-bottom: 2.4rem;
  margin-top: 2.4rem;
  max-width: 60rem;
  width: 100%;
  ${({ theme }) => theme.mediaQueries.small} {
    padding: 1.6rem;
    margin-bottom: 1.2rem;
    margin-top: 1.2rem;
    max-width: 100%;
  }
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.primary?.default};
  color: ${({ theme }) => theme.colors.primary?.inverse};
  border: none;
  border-radius: ${({ theme }) => theme.radii.button};
  padding: 1rem 2rem;
  font-size: ${({ theme }) => theme.fontSizes.small};
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${({ theme }) => theme.colors.primary?.main};
  }

  &:disabled {
    background-color: ${({ theme }) => theme.colors.background?.alternative};
    color: ${({ theme }) => theme.colors.text?.muted};
    cursor: not-allowed;
  }
`;

const Index = () => {
  const { error } = useMetaMaskContext();
  const { isFlask, snapsDetected, installedSnap } = useMetaMask();
  const requestSnap = useRequestSnap();
  const invokeSnap = useInvokeSnap();

  const isMetaMaskReady = isLocalSnap(defaultSnapOrigin)
    ? isFlask
    : snapsDetected;

  const handleShowHome = async () => {
    await invokeSnap({ method: 'showHome' });
  };

  const handleConfigureChannel = async () => {
    await invokeSnap({ method: 'configureSettings' });
  };

  const handleConfigureServer = async () => {
    await invokeSnap({ method: 'configureServer' });
  };

  const handleGetChannelInfo = async () => {
    const result = await invokeSnap({ method: 'getChannelInfo' });
    console.log('Channel Info:', result);
  };

  return (
    <Container>
      <Heading>
        <Span>Tokamak Channels</Span>
      </Heading>
      <Subtitle>
        Layer 2 State Channel with ZK Proof Verification
      </Subtitle>
      <CardContainer>
        {error && (
          <ErrorMessage>
            <b>An error happened:</b> {error.message}
          </ErrorMessage>
        )}
        {!isMetaMaskReady && (
          <Card
            content={{
              title: 'Install MetaMask Flask',
              description:
                'Snaps is pre-release software only available in MetaMask Flask, a canary distribution for developers with access to upcoming features.',
              button: <InstallFlaskButton />,
            }}
            fullWidth
          />
        )}
        {!installedSnap && (
          <Card
            content={{
              title: 'Connect & Install Snap',
              description:
                'Connect to MetaMask Flask and install the Tokamak Channels Snap.',
              button: (
                <ConnectButton
                  onClick={requestSnap}
                  disabled={!isMetaMaskReady}
                />
              ),
            }}
            disabled={!isMetaMaskReady}
          />
        )}
        {shouldDisplayReconnectButton(installedSnap) && (
          <Card
            content={{
              title: 'Reconnect',
              description:
                'Update the snap after making changes to the code.',
              button: (
                <ReconnectButton
                  onClick={requestSnap}
                  disabled={!installedSnap}
                />
              ),
            }}
            disabled={!installedSnap}
          />
        )}
        <Card
          content={{
            title: 'Channel Dashboard',
            description:
              'View your channel status, participants, and leader information.',
            button: (
              <Button
                onClick={handleShowHome}
                disabled={!installedSnap}
              >
                Show Dashboard
              </Button>
            ),
          }}
          disabled={!installedSnap}
        />
        <Card
          content={{
            title: 'Configure Channel',
            description:
              'Set your Channel ID (bytes32) to connect to a channel.',
            button: (
              <Button
                onClick={handleConfigureChannel}
                disabled={!installedSnap}
              >
                Set Channel ID
              </Button>
            ),
          }}
          disabled={!installedSnap}
        />
        <Card
          content={{
            title: 'Configure Server',
            description:
              'Set the Leader Server URL for L2 transactions.',
            button: (
              <Button
                onClick={handleConfigureServer}
                disabled={!installedSnap}
              >
                Set Server URL
              </Button>
            ),
          }}
          disabled={!installedSnap}
        />
        <Notice>
          <p>
            <b>Tokamak Private App Channels</b> - Execute off-chain ERC20 transactions 
            with ZK proof verification. Don't Trust. Verify.
          </p>
        </Notice>
      </CardContainer>
    </Container>
  );
};

export default Index;
