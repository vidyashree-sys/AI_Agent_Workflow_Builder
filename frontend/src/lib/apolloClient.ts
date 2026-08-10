import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

const HASURA_URL = process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';

const httpLink = createHttpLink({
  uri: HASURA_URL,
});

const authLink = setContext((_, { headers }) => {
  // Read active user ID from localStorage so the switcher works dynamically
  const activeUserId = typeof window !== 'undefined' 
    ? localStorage.getItem('demo_user_id') || 'aaaaaaaa-1111-1111-1111-111111111111'
    : 'aaaaaaaa-1111-1111-1111-111111111111';

  return {
    headers: {
      ...headers,
      'x-hasura-admin-secret': 'myadminsecret',
      'x-hasura-role': 'user',
      'x-hasura-user-id': activeUserId,
    },
  };
});

export const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});