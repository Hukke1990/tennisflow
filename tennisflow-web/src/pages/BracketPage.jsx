import { useParams } from 'react-router-dom';
import TournamentBracket from '../components/TournamentBracket';

export default function BracketPage() {
  const { torneoId } = useParams();
  return (
    <div>
      <TournamentBracket torneoId={torneoId} />
    </div>
  );
}
